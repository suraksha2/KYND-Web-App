import { Router } from 'express';
import pool from '../lib/mysql';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, profile_name, profile_email, profile_role, bio FROM settings LIMIT 1`
    );
    res.status(200).json({ data: rows });
  } catch (err) {
    console.error('[GET /api/settings]', err);
    res.status(500).json({ error: 'Failed to fetch settings.' });
  }
});

router.put('/', async (req, res) => {
  try {
    const { profile_name, profile_email, profile_role, bio } = req.body;

    // Check if settings record exists
    const [existing] = await pool.query(`SELECT id FROM settings LIMIT 1`);

    if (Array.isArray(existing) && existing.length > 0) {
      // Update existing record
      await pool.query(
        `UPDATE settings SET profile_name = ?, profile_email = ?, profile_role = ?, bio = ? WHERE id = ?`,
        [profile_name, profile_email, profile_role, bio, (existing as any)[0].id]
      );
    } else {
      // Insert new record
      await pool.query(
        `INSERT INTO settings (profile_name, profile_email, profile_role, bio) VALUES (?, ?, ?, ?)`,
        [profile_name, profile_email, profile_role, bio]
      );
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[PUT /api/settings]', err);
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});

export default router;
