import { Router } from 'express';
import pool from '../lib/mysql';
import bcrypt from 'bcryptjs';

const router = Router();

// GET all service providers
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        id,
        name,
        email,
        mobile,
        services,
        city,
        status,
        rating,
        total_jobs,
        avatar,
        working_hours,
        joined,
        created_at
      FROM service_providers 
      ORDER BY created_at DESC`
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('[GET /api/service-providers]', error);
    return res.status(500).json({ error: 'Failed to fetch service providers' });
  }
});

// POST create new service provider
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const { name, email, mobile, services, city, status = 'active', avatar, working_hours, password } = body;

    if (!name || !email || !mobile || !services || !city) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Optional login password for the provider portal.
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const [result] = await pool.query(
      `INSERT INTO service_providers (name, email, password_hash, mobile, services, city, status, avatar, working_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email.trim().toLowerCase(), passwordHash, mobile, JSON.stringify(services), city, status, avatar || null, working_hours ? JSON.stringify(working_hours) : null]
    );

    return res.status(201).json({
      success: true,
      id: (result as any).insertId
    });
  } catch (error) {
    console.error('[POST /api/service-providers]', error);
    return res.status(500).json({ error: 'Failed to create service provider' });
  }
});

// PUT update service provider
router.put('/', async (req, res) => {
  try {
    const body = req.body;
    const { id, name, email, mobile, services, city, status, avatar, working_hours, password } = body;

    if (!id) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }

    // Only update the password when a new one is explicitly provided.
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE service_providers SET password_hash = ? WHERE id = ?',
        [passwordHash, id]
      );
    }

    const [result] = await pool.query(
      `UPDATE service_providers 
       SET name = ?, email = ?, mobile = ?, services = ?, city = ?, status = ?, avatar = ?, working_hours = ?
       WHERE id = ?`,
      [name, email.trim().toLowerCase(), mobile, JSON.stringify(services), city, status, avatar, working_hours ? JSON.stringify(working_hours) : null, id]
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[PUT /api/service-providers]', error);
    return res.status(500).json({ error: 'Failed to update service provider' });
  }
});

// DELETE service provider
router.delete('/', async (req, res) => {
  try {
    const id = req.query.id;

    if (!id) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }

    await pool.query('DELETE FROM service_providers WHERE id = ?', [id]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/service-providers]', error);
    return res.status(500).json({ error: 'Failed to delete service provider' });
  }
});

export default router;
