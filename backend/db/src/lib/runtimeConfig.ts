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

  if (process.env.ADMIN_SIGNUP_ENABLED === 'true') {
    throw new Error('Public admin signup is removed. Create administrators through the controlled bootstrap script.');
  }

  // Demo intents can be fulfilled as real bookings, so production must use
  // Airwallex's live environment rather than merely having valid credentials.
  const airwallexEnv = (process.env.AIRWALLEX_ENV || 'prod').trim().toLowerCase();
  if (airwallexEnv !== 'prod') {
    throw new Error('AIRWALLEX_ENV must be prod in production.');
  }
  requiredIntegrationValue('AIRWALLEX_CLIENT_ID');
  requiredIntegrationValue('AIRWALLEX_API_KEY');
  const internalToken = process.env.INTERNAL_API_TOKEN?.trim();
  if (internalToken && (internalToken.length < 16 || PLACEHOLDER_SECRET.test(internalToken))) {
    throw new Error('INTERNAL_API_TOKEN must be at least 16 non-placeholder characters in production.');
  }
}
