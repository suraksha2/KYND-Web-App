const PLACEHOLDER_SECRET = /^(change[_ -]?me|changeme|password|secret|root123)/i;

function requiredSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < 16 || PLACEHOLDER_SECRET.test(value)) {
    throw new Error(`${name} must be set to a non-placeholder value of at least 16 characters in production.`);
  }
  return value;
}

function validateProductionOrigins(): void {
  const entries = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!entries.length) {
    throw new Error('ALLOWED_ORIGINS must contain at least one HTTPS origin in production.');
  }

  for (const origin of entries) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('ALLOWED_ORIGINS must contain only valid HTTPS origins in production.');
    }
    if (parsed.protocol !== 'https:' || parsed.origin !== origin) {
      throw new Error('ALLOWED_ORIGINS entries must be HTTPS origins without paths in production.');
    }
  }
}

function requiredIntegrationValue(name: string): void {
  const value = process.env[name]?.trim();
  if (!value || /^(your_|change[_ -]?me|changeme|password)/i.test(value)) {
    throw new Error(`${name} must be set to a non-placeholder value in production.`);
  }
}

export function validateProductionConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;
  requiredSecret('SESSION_SECRET');
  validateProductionOrigins();

  // The production default is live payments, so don't boot with checkout
  // configured to fail only after a customer submits an order.
  if ((process.env.AIRWALLEX_ENV || 'prod').toLowerCase() === 'prod') {
    requiredIntegrationValue('AIRWALLEX_CLIENT_ID');
    requiredIntegrationValue('AIRWALLEX_API_KEY');
  }
  if (process.env.ADMIN_SIGNUP_ENABLED === 'true') {
    requiredSecret('ADMIN_SIGNUP_SECRET');
  }
  const internalToken = process.env.INTERNAL_API_TOKEN?.trim();
  if (internalToken && (internalToken.length < 16 || PLACEHOLDER_SECRET.test(internalToken))) {
    throw new Error('INTERNAL_API_TOKEN must be at least 16 non-placeholder characters in production.');
  }
}
