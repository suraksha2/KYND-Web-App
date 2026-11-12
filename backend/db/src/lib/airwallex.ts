import { randomUUID } from 'crypto';

/**
 * Thin server-side wrapper around the Airwallex Payments API.
 *
 * Flow (https://www.airwallex.com/docs/payments/get-started/using-payments-intent-api):
 *   1. Authenticate with x-client-id + x-api-key  -> short-lived bearer token.
 *   2. Create a PaymentIntent                     -> returns { id, client_secret }.
 *   3. Frontend SDK (Airwallex.js Drop-in) uses id + client_secret to collect
 *      and confirm payment.
 *   4. Retrieve the PaymentIntent server-side to verify status before fulfilling.
 */

const AIRWALLEX_ENV = (process.env.AIRWALLEX_ENV || 'prod').toLowerCase();

const API_BASE =
  AIRWALLEX_ENV === 'demo'
    ? 'https://api-demo.airwallex.com'
    : 'https://api.airwallex.com';

interface TokenCache {
  token: string;
  // epoch millis at which we should refresh (a little before real expiry)
  refreshAt: number;
}

let tokenCache: TokenCache | null = null;

// Default placeholders shipped in .env.local — treated as "not configured".
const PLACEHOLDER_VALUES = new Set([
  'your_airwallex_client_id',
  'your_airwallex_api_key',
  '',
]);

export class AirwallexConfigError extends Error {}

function assertCredentials(): { clientId: string; apiKey: string } {
  const clientId = process.env.AIRWALLEX_CLIENT_ID;
  const apiKey = process.env.AIRWALLEX_API_KEY;
  if (
    !clientId ||
    !apiKey ||
    PLACEHOLDER_VALUES.has(clientId) ||
    PLACEHOLDER_VALUES.has(apiKey)
  ) {
    throw new AirwallexConfigError(
      'Airwallex is not configured. Set real AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY in backend/db/.env.local and restart the dev server.'
    );
  }
  return { clientId, apiKey };
}

/**
 * Returns a valid bearer token, authenticating (and caching) as needed.
 * Airwallex tokens are valid for ~30 minutes; we refresh a couple of minutes early.
 */
async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.refreshAt) {
    return tokenCache.token;
  }

  const { clientId, apiKey } = assertCredentials();

  const res = await fetch(`${API_BASE}/api/v1/authentication/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': clientId,
      'x-api-key': apiKey,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.token) {
    const message = data?.message || data?.code || `HTTP ${res.status}`;
    throw new Error(`Airwallex authentication failed: ${message}`);
  }

  // Cache for 25 minutes regardless of returned expiry to stay safely within the
  // ~30 minute token lifetime.
  tokenCache = {
    token: data.token,
    refreshAt: Date.now() + 25 * 60 * 1000,
  };

  return data.token;
}

export interface CreatePaymentIntentParams {
  /** Amount in major units (e.g. 9.99 for S$9.99). */
  amount: number;
  /** 3-letter ISO 4217 currency code. */
  currency: string;
  /** Your internal reference (we use the booking id). */
  merchantOrderId: string;
  /** Optional metadata persisted on the transaction for reconciliation. */
  metadata?: Record<string, unknown>;
  /** Optional URL the customer returns to after off-site auth (e.g. 3DS). */
  returnUrl?: string;
  /** Optional human-readable statement descriptor. */
  descriptor?: string;
}

export interface PaymentIntent {
  id: string;
  client_secret: string;
  amount: number;
  currency: string;
  status: string;
  merchant_order_id?: string;
  [key: string]: unknown;
}

/**
 * Creates a PaymentIntent. The amount must always be decided server-side to
 * prevent tampering. A fresh request_id is generated per call for idempotency.
 */
export async function createPaymentIntent(
  params: CreatePaymentIntentParams
): Promise<PaymentIntent> {
  const token = await getAccessToken();

  const body: Record<string, unknown> = {
    request_id: randomUUID(),
    amount: Number(params.amount),
    currency: params.currency,
    merchant_order_id: params.merchantOrderId,
  };
  if (params.metadata) body.metadata = params.metadata;
  if (params.returnUrl) body.return_url = params.returnUrl;
  if (params.descriptor) body.descriptor = params.descriptor;

  const res = await fetch(`${API_BASE}/api/v1/pa/payment_intents/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.id || !data?.client_secret) {
    const message = data?.message || data?.code || `HTTP ${res.status}`;
    throw new Error(`Failed to create Airwallex PaymentIntent: ${message}`);
  }

  return data as PaymentIntent;
}

/**
 * Retrieves a PaymentIntent so the server can verify its status
 * (e.g. SUCCEEDED) before fulfilling an order.
 */
export async function retrievePaymentIntent(id: string): Promise<PaymentIntent> {
  const token = await getAccessToken();

  const res = await fetch(`${API_BASE}/api/v1/pa/payment_intents/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.id) {
    const message = data?.message || data?.code || `HTTP ${res.status}`;
    throw new Error(`Failed to retrieve Airwallex PaymentIntent: ${message}`);
  }

  return data as PaymentIntent;
}

export const airwallexEnv = AIRWALLEX_ENV;
export const paymentCurrency = process.env.PAYMENT_CURRENCY || 'SGD';
