import cors from 'cors';

// Local dev origins that are always allowed. Production origins are supplied
// via the ALLOWED_ORIGINS env var (comma-separated list of full origins,
// e.g. "https://app.helpr.com,https://admin.helpr.com").
const devOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Standalone admin console (separate Vite app / Node process).
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5176',
  // Superadmin console.
  'http://localhost:5177',
  'http://127.0.0.1:5177',
];

const envOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...devOrigins, ...envOrigins]));

// Outside production, accept any loopback origin: Vite hops ports when one is
// taken and IDE/browser previews proxy the app on a random port, which would
// otherwise get a preflight with no Access-Control-Allow-Origin header.
function isOriginAllowed(origin: string): boolean {
  if (allowedOrigins.includes(origin)) return true;
  return (
    process.env.NODE_ENV !== 'production' &&
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)
  );
}

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Same-origin / non-browser callers send no Origin header.
    if (!origin) return callback(null, true);
    callback(null, isOriginAllowed(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
