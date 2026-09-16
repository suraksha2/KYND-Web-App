import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../lib/mysql';
import { createSessionToken } from '../lib/auth';
import { clearSessionCookie, getSession, setSessionCookie } from '../http/session';

const router = Router();

// Simple per-IP sliding window for auth endpoints (login/signup/reset).
// In-memory is enough for a single API process; multi-instance deploys
// should front this with a reverse-proxy limit as well.
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 30;
const authAttempts = new Map<string, { count: number; resetAt: number }>();

function authRateLimit(req: any, res: any, next: any) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
  const now = Date.now();
  const entry = authAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    authAttempts.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return next();
  }
  entry.count += 1;
  if (entry.count > AUTH_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }
  return next();
}

router.use(authRateLimit);

router.post('/login', async (req, res) => {
  try {
    const body = req.body;
    const { email, password } = body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user by email
    const [users] = await pool.query(
      'SELECT id, name, email, password_hash, role, status, created_at FROM users WHERE email = ?',
      [normalizedEmail]
    );

    const userArray = users as any[];
    if (!userArray || userArray.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = userArray[0];

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is inactive. Please contact support.' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Issue a signed, httpOnly session cookie carrying the user's role.
    // This is what the server (middleware) uses for role-based access control;
    // client-side localStorage state is purely cosmetic.
    const token = await createSessionToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    setSessionCookie(res, token);

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.created_at,
      // Token is also returned in the body so cross-origin clients (e.g. the
      // customer app on :5173) can authenticate via an Authorization header,
      // since cross-site cookies are unreliable in browsers.
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Unable to sign in.' });
  }
});

router.post('/logout', async (_req, res) => {
  // Clear the session cookie.
  clearSessionCookie(res);

  return res.json({ message: 'Logged out.' });
});

router.post('/signup', async (req, res) => {
  try {
    const body = req.body;
    const { name, email, password, secret } = body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check admin secret if provided. Require a configured, non-empty secret —
    // never elevate when ADMIN_SIGNUP_SECRET is unset.
    let assignedRole = 'user';
    if (secret) {
      const adminSecret = process.env.ADMIN_SIGNUP_SECRET;
      if (adminSecret && adminSecret.length >= 16 && secret === adminSecret) {
        assignedRole = 'super_admin';
      } else {
        return res.status(403).json({ error: 'Invalid admin signup secret.' });
      }
    }

    // Check if user already exists
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (Array.isArray(existingUsers) && existingUsers.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user without explicitly listing 'joined', relying on DEFAULT CURRENT_DATE
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), normalizedEmail, passwordHash, assignedRole, 'active']
    );

    const insertResult = result as any;
    const userId = insertResult.insertId;

    const [newUsers] = await pool.query(
      'SELECT created_at FROM users WHERE id = ?',
      [userId]
    );
    const createdAt = (newUsers as any[])[0]?.created_at;

    // Issue session token
    const token = await createSessionToken({
      id: userId,
      email: normalizedEmail,
      role: assignedRole,
    });

    setSessionCookie(res, token);

    return res.status(201).json({
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      role: assignedRole,
      createdAt,
      token,
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Unable to create account.' });
  }
});

// Dedicated login for service providers. Credentials live in the
// `service_providers` table (separate from admin/customer `users`), and the
// issued session token carries role='provider' so the provider portal and
// /api/provider/* routes can be gated independently of the admin panel.
router.post('/provider-login', async (req, res) => {
  try {
    const body = req.body;
    const { email, password } = body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [rows] = await pool.query(
      'SELECT id, name, email, password_hash, status FROM service_providers WHERE email = ?',
      [normalizedEmail]
    );

    const providers = rows as any[];
    if (!providers || providers.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const provider = providers[0];

    if (!provider.password_hash) {
      return res
        .status(403)
        .json({ error: 'No password set for this account. Please contact the admin.' });
    }

    if (provider.status !== 'active' && provider.status !== 'busy') {
      return res.status(403).json({ error: 'Account is inactive. Please contact support.' });
    }

    const isValidPassword = await bcrypt.compare(password, provider.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = await createSessionToken({
      id: provider.id,
      email: provider.email,
      role: 'provider',
    });

    setSessionCookie(res, token);

    return res.json({
      id: provider.id,
      name: provider.name,
      email: provider.email,
      role: 'provider',
      token,
    });
  } catch (error) {
    console.error('Provider login error:', error);
    return res.status(500).json({ error: 'Unable to sign in.' });
  }
});

router.post('/forgot-password', async (_req, res) => {
  // Email delivery is not configured. Refuse rather than minting unused reset
  // tokens that accumulate in the database.
  return res.status(503).json({
    error: 'Password reset by email is not available yet. Please contact support.',
  });
});

router.post('/reset-password', async (_req, res) => {
  return res.status(503).json({
    error: 'Password reset by email is not available yet. Please contact support.',
  });
});

router.post('/change-password', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const body = req.body;
    const { currentPassword, newPassword } = body;
    // Always bind to the authenticated session — ignore any client-supplied userId.
    const userId = session.id;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: 'Current password and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    // Get user's current password hash
    const [users] = await pool.query(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    const userArray = users as any[];
    if (!userArray || userArray.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = userArray[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, userId]
    );

    return res.json({
      message: 'Password changed successfully.'
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: 'Unable to change password.' });
  }
});

router.put('/update-profile', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const body = req.body;
    const { name, email } = body;
    // Always bind to the authenticated session — ignore any client-supplied userId.
    const userId = session.id;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email is already taken by another user
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [normalizedEmail, userId]
    );

    const userArray = existingUsers as any[];
    if (userArray && userArray.length > 0) {
      return res.status(409).json({ error: 'Email is already taken by another user.' });
    }

    // Update user profile
    await pool.query(
      'UPDATE users SET name = ?, email = ? WHERE id = ?',
      [name.trim(), normalizedEmail, userId]
    );

    return res.json({
      message: 'Profile updated successfully.',
      name: name.trim(),
      email: normalizedEmail
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Unable to update profile.' });
  }
});

export default router;
