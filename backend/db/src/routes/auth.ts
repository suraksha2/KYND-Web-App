import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../lib/mysql';
import { createSessionToken, SESSION_COOKIE_NAME, verifySessionToken } from '../lib/auth';
import { ensureReferralCode, newReferralCode, validateReferralCode } from '../lib/referrals';
import {
  clearSessionCookie, CUSTOMER_SESSION_COOKIE_NAME, getSession,
  PROVIDER_SESSION_COOKIE_NAME, requireCustomerSession, setSessionCookie,
} from '../http/session';

const router = Router();

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
      'SELECT id, name, email, password_hash, role, status, session_version, created_at, referral_code FROM users WHERE email = ?',
      [normalizedEmail]
    );

    const userArray = users as any[];
    if (!userArray || userArray.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = userArray[0];

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Ensure every user has a shareable referral code for the "Refer a friend" offer.
    if (!user.referral_code || /^KYND-\d+$/i.test(user.referral_code)) {
      try {
        user.referral_code = await ensureReferralCode(user.id, user.referral_code, pool);
      } catch (e) {
        console.error('Failed to set referral code on login:', e);
        user.referral_code = null;
      }
    }

    // Issue a signed, httpOnly session cookie carrying the user's role.
    // This is what the server (middleware) uses for role-based access control;
    // client-side localStorage state is purely cosmetic.
    const token = await createSessionToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      sessionVersion: Number(user.session_version),
    });

    setSessionCookie(res, token, user.role);

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.created_at,
      referralCode: user.referral_code,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Unable to sign in.' });
  }
});

router.post('/logout', async (req, res) => {
  // Clear only the app-specific cookie so switching roles doesn't log out the
  // other app in the same browser.
  const expectedRole = req.get('X-Helpr-Expected-Role');
  if (expectedRole === 'user' || expectedRole === 'provider') {
    const scopedCookie = expectedRole === 'user'
      ? CUSTOMER_SESSION_COOKIE_NAME
      : PROVIDER_SESSION_COOKIE_NAME;
    const legacySession = req.cookies?.[scopedCookie]
      ? null
      : await verifySessionToken(req.cookies?.[SESSION_COOKIE_NAME]);
    clearSessionCookie(res, expectedRole);
    if (legacySession?.role === expectedRole) clearSessionCookie(res);
  } else {
    clearSessionCookie(res);
  }

  return res.json({ message: 'Logged out.' });
});

router.get('/session', async (req, res) => {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Authentication required.' });
  return res.json({
    id: session.id,
    name: session.name,
    email: session.email,
    role: session.role,
    vendorId: session.vendorId,
    providerId: session.providerId,
  });
});

router.post('/signup', async (req, res) => {
  try {
    const body = req.body;
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (Object.prototype.hasOwnProperty.call(body, 'secret')) {
      return res.status(403).json({ error: 'Admin signup is disabled. Use the controlled bootstrap process.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const assignedRole = 'user';

    // Check if user already exists
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (Array.isArray(existingUsers) && existingUsers.length > 0) {
      return res.status(409).json({ error: 'Unable to create account. Please check your details or sign in.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const referralCode = newReferralCode();

    // Insert user without explicitly listing 'joined', relying on DEFAULT CURRENT_DATE
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, status, referral_code) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), normalizedEmail, passwordHash, assignedRole, 'active', referralCode]
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
      name: name.trim(),
      sessionVersion: 1,
    });

    setSessionCookie(res, token, assignedRole);

    return res.status(201).json({
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      role: assignedRole,
      createdAt,
      referralCode,
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Unable to create account.' });
  }
});

router.get('/referral-code', requireCustomerSession, async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const [users] = await pool.query(
      'SELECT id, referral_code FROM users WHERE id = ?',
      [session.id]
    );
    const userArray = users as any[];
    if (!userArray || userArray.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = userArray[0];
    let referralCode: string;
    try {
      referralCode = await ensureReferralCode(user.id, user.referral_code, pool);
    } catch (e) {
      console.error('Failed to generate referral code:', e);
      return res.status(500).json({ error: 'Unable to generate referral code.' });
    }

    return res.json({ referralCode });
  } catch (error) {
    console.error('Get referral code error:', error);
    return res.status(500).json({ error: 'Unable to get referral code.' });
  }
});

router.post('/validate-referral', async (req, res) => {
  try {
    const code = req.body?.code;
    const session = await getSession(req);
    const customerId = session?.role === 'user' ? session.id : undefined;
    const result = await validateReferralCode(code, customerId, pool);
    return res.json(result);
  } catch (error) {
    console.error('Validate referral error:', error);
    return res.status(500).json({ error: 'Unable to validate referral code.' });
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
      'SELECT id, name, email, password_hash, status, session_version FROM service_providers WHERE email = ?',
      [normalizedEmail]
    );

    const providers = rows as any[];
    if (!providers || providers.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const provider = providers[0];

    if (!provider.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (provider.status !== 'active' && provider.status !== 'busy') {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isValidPassword = await bcrypt.compare(password, provider.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = await createSessionToken({
      id: provider.id,
      email: provider.email,
      role: 'provider',
      name: provider.name,
      sessionVersion: Number(provider.session_version),
    });

    setSessionCookie(res, token, 'provider');

    return res.json({
      id: provider.id,
      name: provider.name,
      email: provider.email,
      role: 'provider',
    });
  } catch (error) {
    console.error('Provider login error:', error);
    return res.status(500).json({ error: 'Unable to sign in.' });
  }
});

// Dedicated login for vendor Partner OS seats. Credentials live in
// `vendor_users` (separate from admin/customer `users` and `service_providers`).
// The issued session carries role='vendor_owner'|'vendor_manager'|'vendor_field'
// plus vendorId (and providerId for field seats) so /api/vendor/* routes can
// scope every query to the vendor's own data.
router.post('/vendor-login', async (req, res) => {
  try {
    const body = req.body;
    const { email, password } = body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [rows] = await pool.query(
      `SELECT vu.id, vu.vendor_id, vu.provider_id, vu.name, vu.email, vu.password_hash,
              vu.session_version,
              vu.role, vu.status, v.name AS vendor_name, v.categories AS vendor_categories,
              v.status AS vendor_status
         FROM vendor_users vu
         JOIN vendors v ON v.id = vu.vendor_id
        WHERE vu.email = ?`,
      [normalizedEmail]
    );

    const seats = rows as any[];
    if (!seats || seats.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const seat = seats[0];

    if (seat.status !== 'active') {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (seat.vendor_status !== 'active') {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isValidPassword = await bcrypt.compare(password, seat.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const role = `vendor_${seat.role}` as const;

    const token = await createSessionToken({
      id: seat.id,
      email: seat.email,
      role,
      sessionVersion: Number(seat.session_version),
      vendorId: seat.vendor_id,
      providerId: seat.provider_id ?? undefined,
      name: seat.name,
    });

    setSessionCookie(res, token);

    return res.json({
      id: seat.id,
      name: seat.name,
      email: seat.email,
      role,
      vendorId: seat.vendor_id,
      vendorName: seat.vendor_name,
      vendorCategories: seat.vendor_categories,
    });
  } catch (error) {
    console.error('Vendor login error:', error);
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
    if (!['user', 'admin', 'super_admin'].includes(session.role)) {
      return res.status(403).json({ error: 'Password changes are not available for this account.' });
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
      'UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?',
      [newPasswordHash, userId]
    );

    clearSessionCookie(res, session.role);
    return res.json({
      message: 'Password changed successfully.'
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: 'Unable to change password.' });
  }
});

router.put('/update-profile', requireCustomerSession, async (req, res) => {
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
