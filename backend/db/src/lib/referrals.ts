import { randomBytes } from 'crypto';
import type { Pool } from 'mysql2/promise';

const REFERRAL_DISCOUNT = 15;

type ReferralDatabase = Pick<Pool, 'query'>;

export function newReferralCode(): string {
  return `KYND-${randomBytes(7).toString('hex').toUpperCase()}`;
}

export function isLegacyReferralCode(code: unknown): boolean {
  return typeof code === 'string' && /^KYND-\d+$/i.test(code);
}

export async function ensureReferralCode(
  userId: number,
  existingCode: string | null | undefined,
  db: ReferralDatabase
): Promise<string> {
  if (existingCode && !isLegacyReferralCode(existingCode)) return existingCode;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const referralCode = newReferralCode();
    try {
      await db.query(
        `UPDATE users
            SET referral_code = ?
          WHERE id = ? AND (referral_code IS NULL OR referral_code = ?)`,
        [referralCode, userId, existingCode || null]
      );
      const [rows] = await db.query(
        'SELECT referral_code FROM users WHERE id = ?',
        [userId]
      );
      const savedCode = (rows as any[])[0]?.referral_code;
      if (savedCode && !isLegacyReferralCode(savedCode)) return savedCode;
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error;
    }
  }

  throw new Error('Unable to allocate a unique referral code.');
}

export async function validateReferralCode(
  code: unknown,
  sessionUserId: number | undefined,
  db: ReferralDatabase
): Promise<{ valid: boolean; discount: number }> {
  if (typeof code !== 'string') return { valid: false, discount: 0 };

  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode || normalizedCode.length > 20 || isLegacyReferralCode(normalizedCode)) {
    return { valid: false, discount: 0 };
  }

  const [rows] = await db.query(
    'SELECT id FROM users WHERE referral_code = ? LIMIT 1',
    [normalizedCode]
  );
  const referrer = (rows as any[])[0];
  if (!referrer || (sessionUserId !== undefined && Number(referrer.id) === Number(sessionUserId))) {
    return { valid: false, discount: 0 };
  }

  return { valid: true, discount: REFERRAL_DISCOUNT };
}
