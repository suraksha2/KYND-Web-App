import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pool from '../lib/mysql';
import { createSessionToken, SESSION_COOKIE_NAME } from '../lib/auth';
import { clearSessionCookie, setSessionCookie } from '../http/session';

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

    console.log('Login: Set cookie', SESSION_COOKIE_NAME, 'for user', user.email, 'role', user.role)
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

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check admin secret if provided
    let assignedRole = 'user';
    if (secret) {
      if (secret === process.env.ADMIN_SIGNUP_SECRET) {
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
    return res.status(500).json({ error: 'Unable to create account.', details: error.message });
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

router.post('/forgot-password', async (req, res) => {
  try {
    const body = req.body;
    const { email } = body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user by email
    const [users] = await pool.query(
      'SELECT id, name, email FROM users WHERE email = ?',
      [normalizedEmail]
    );

    const userArray = users as any[];
    if (!userArray || userArray.length === 0) {
      // Don't reveal that user doesn't exist for security
      return res.json({
        message: 'If an account exists with this email, you will receive a password reset link.'
      });
    }

    const user = userArray[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Store reset token in database
    await pool.query(
      'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
      [resetToken, resetTokenExpiry, user.id]
    );

    // In a real application, you would send an email here with the reset link
    // TODO: Implement email sending service (e.g., SendGrid, AWS SES, etc.)
    // const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
    // await sendResetEmail(user.email, resetUrl);

    return res.json({
      message: 'If an account exists with this email, you will receive a password reset link.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Unable to process request.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const body = req.body;
    const { token, password } = body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Find user with valid reset token
    const [users] = await pool.query(
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
      [token]
    );

    const userArray = users as any[];
    if (!userArray || userArray.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    const user = userArray[0];

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    await pool.query(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
      [passwordHash, user.id]
    );

    return res.json({
      message: 'Password has been reset successfully.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Unable to reset password.' });
  }
});

router.post('/change-password', async (req, res) => {
  try {
    const body = req.body;
    const { userId, currentPassword, newPassword } = body;

    if (!userId || !currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: 'User ID, current password, and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
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
    const body = req.body;
    const { userId, name, email } = body;

    if (!userId || !name || !email) {
      return res.status(400).json({ error: 'User ID, name, and email are required.' });
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
