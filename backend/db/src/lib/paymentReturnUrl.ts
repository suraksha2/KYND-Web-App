import { isOriginAllowed } from '../http/cors';

const CONFIRMATION_PATH = /(?:^|\/)booking\/confirmed$/;

export function validatePaymentReturnUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    url.username
    || url.password
    || url.search
    || url.hash
    || !CONFIRMATION_PATH.test(url.pathname)
    || !isOriginAllowed(url.origin)
  ) {
    return null;
  }

  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    return null;
  }

  return url.toString();
}
