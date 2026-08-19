import { Router } from 'express';
import pool from '../lib/mysql';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, email, phone, source, created_at FROM waitlist ORDER BY created_at DESC`
    );
    return res.status(200).json({ data: rows });
  } catch (err) {
    console.error("[GET /api/waitlist]", err);
    return res.status(500).json({ error: "Failed to fetch waitlist." });
  }
});

router.post('/', async (req, res) => {
  try {
    const { email, phone, source } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    const [result] = await pool.query(
      `INSERT INTO waitlist (email, phone, source) VALUES (?, ?, ?)`,
      [cleanEmail, (typeof phone === 'string' && phone.trim()) || null, source || 'landing']
    );
    return res.status(201).json({ id: (result as any).insertId, alreadyJoined: false });
  } catch (err: any) {
    // Signing up twice is not an error for the visitor — they are on the list.
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(200).json({ alreadyJoined: true });
    }
    console.error("[POST /api/waitlist]", err);
    return res.status(500).json({ error: "Failed to join the waitlist." });
  }
});

export default router;
