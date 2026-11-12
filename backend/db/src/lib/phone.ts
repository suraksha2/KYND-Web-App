const PHONE_FORMATTING = /[()\s.-]/g;
const ALLOWED_PHONE_CHARACTERS = /^[+0-9()\s.-]+$/;

/** Normalize an explicit international number or an 8-digit Singapore mobile to E.164. */
export function normalizePhoneToE164(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (!input || !ALLOWED_PHONE_CHARACTERS.test(input)) return null;

  let compact = input.replace(PHONE_FORMATTING, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;
  if (!compact.startsWith('+')) {
    if (/^[89]\d{7}$/.test(compact)) compact = `+65${compact}`;
    else if (/^65[89]\d{7}$/.test(compact)) compact = `+${compact}`;
    else return null;
  }

  if (!/^\+[1-9]\d{1,14}$/.test(compact)) return null;
  if (compact.startsWith('+65') && !/^\+65[89]\d{7}$/.test(compact)) return null;
  return compact;
}
