import { Router } from 'express';
import pool from '../lib/mysql';
import { getSession } from '../http/session';

const router = Router();

// Payment methods the storefront can preselect. A saved value outside this set
// would silently fail to apply, so reject it here instead.
const PAYMENT_METHODS = ['card', 'wallet', 'upi', 'cod'];

const MAX = { address: 255, city: 255, area: 255, phone: 40 };

type Profile = {
  phone: string | null;
  address: string | null;
  city: string | null;
  area: string | null;
  pincode: string | null;
  payment: string | null;
};

function toProfile(row: any): Profile {
  return {
    phone: row.default_phone ?? null,
    address: row.default_address ?? null,
    city: row.default_city ?? null,
    area: row.default_area ?? null,
    pincode: row.default_pincode ?? null,
    payment: row.default_payment ?? null,
  };
}

/** Trim to a max length; an empty string means "clear this field". */
function text(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim().slice(0, max);
  return trimmed || null;
}

// The customer's own saved booking defaults.
router.get('/', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Authentication required.' });

    const [rows]: any = await pool.query(
      `SELECT default_phone, default_address, default_city, default_area,
              default_pincode, default_payment
         FROM users WHERE id = ?`,
      [session.id]
    );
    if (!rows?.length) return res.status(404).json({ error: 'Account not found.' });

    return res.status(200).json({ data: toProfile(rows[0]) });
  } catch (error) {
    console.error('[GET /api/profile]', error);
    return res.status(500).json({ error: 'Failed to load saved details' });
  }
});

router.put('/', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Authentication required.' });

    const { phone, address, city, area, pincode, payment } = req.body || {};

    const cleanPincode = text(pincode, 10);
    if (cleanPincode && !/^\d{6}$/.test(cleanPincode)) {
      return res.status(400).json({ error: 'Invalid postal code. Enter a 6-digit Singapore postal code.' });
    }

    const cleanPayment = text(payment, 20);
    if (cleanPayment && !PAYMENT_METHODS.includes(cleanPayment)) {
      return res.status(400).json({ error: 'Unsupported payment method.' });
    }

    await pool.query(
      `UPDATE users
          SET default_phone = ?, default_address = ?, default_city = ?,
              default_area = ?, default_pincode = ?, default_payment = ?
        WHERE id = ?`,
      [
        text(phone, MAX.phone),
        text(address, MAX.address),
        text(city, MAX.city),
        text(area, MAX.area),
        cleanPincode,
        cleanPayment,
        session.id,
      ]
    );

    const [rows]: any = await pool.query(
      `SELECT default_phone, default_address, default_city, default_area,
              default_pincode, default_payment
         FROM users WHERE id = ?`,
      [session.id]
    );

    return res.status(200).json({ success: true, data: toProfile(rows[0]) });
  } catch (error) {
    console.error('[PUT /api/profile]', error);
    return res.status(500).json({ error: 'Failed to save details' });
  }
});

export default router;
