// Edge-compatible signed session tokens using the Web Crypto API (HMAC-SHA256).
// No external dependencies are required, so this works in both the Node.js
// runtime (API routes) and the Edge runtime (middleware).

const encoder = new TextEncoder();

export const SESSION_COOKIE_NAME = "admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

// Roles permitted to access the admin panel/API.
// `super_admin` is the top tier; `admin` is a standard admin tier.
export const ADMIN_ROLES = ["super_admin", "admin"] as const;

export function hasAdminAccess(role: string | undefined | null): boolean {
  return !!role && (ADMIN_ROLES as readonly string[]).includes(role);
}

// Seats on a vendor (partner company) Partner OS account. `vendor_owner` sees
// everything including money; `vendor_manager` is the same minus money
// screens; `vendor_field` is a worker's own mobile-first view of their jobs.
export const VENDOR_ROLES = ["vendor_owner", "vendor_manager", "vendor_field"] as const;

export function isVendorRole(role: string | undefined | null): boolean {
  return !!role && (VENDOR_ROLES as readonly string[]).includes(role);
}

export function canSeeVendorMoney(role: string | undefined | null): boolean {
  return role === "vendor_owner";
}

// Desk seats (owner/manager) manage the team roster; a field seat is a worker
// viewing their own jobs and has no reason to add/edit teammates.
export function canManageVendorTeam(role: string | undefined | null): boolean {
  return role === "vendor_owner" || role === "vendor_manager";
}

export interface SessionPayload {
  id: number;
  email: string;
  role: string;
  exp: number; // unix seconds
  // Present only for vendor sessions (vendor_owner/vendor_manager/vendor_field).
  vendorId?: number;
  // Present only for vendor_field sessions, linking the seat to its worker row.
  providerId?: number;
  name?: string;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET environment variable is missing or too short (min 16 chars)."
    );
  }
  return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  let normalized = str.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) normalized += "=";
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(
  user: { id: number; email: string; role: string; vendorId?: number; providerId?: number; name?: string },
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS
): Promise<string> {
  const payload: SessionPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
    ...(user.vendorId !== undefined ? { vendorId: user.vendorId } : {}),
    ...(user.providerId !== undefined ? { providerId: user.providerId } : {}),
    ...(user.name !== undefined ? { name: user.name } : {}),
  };
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await getKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payloadB64)
  );
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${payloadB64}.${signatureB64}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signatureB64] = parts;

  try {
    const key = await getKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signatureB64) as unknown as BufferSource,
      encoder.encode(payloadB64)
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64))
    ) as SessionPayload;

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
