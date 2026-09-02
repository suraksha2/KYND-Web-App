import { Router } from 'express';
import pool from '../lib/mysql';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, customer_price, partner_cost, created_at, updated_at FROM addons ORDER BY name');
    return res.status(200).json({ data: rows });
  } catch (err) {
    console.error('[GET /api/addons]', err);
    return res.status(500).json({ error: 'Failed to fetch add-ons.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM addons WHERE id = ?', [req.params.id]);
    const addons = rows as any[];
    if (!addons.length) {
      return res.status(404).json({ error: 'Add-on not found.' });
    }
    return res.status(200).json({ data: addons[0] });
  } catch (err) {
    console.error('[GET /api/addons/:id]', err);
    return res.status(500).json({ error: 'Failed to fetch add-on.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, customer_price, partner_cost } = req.body;
    if (!name || customer_price === undefined) {
      return res.status(400).json({ error: 'name and customer_price are required.' });
    }

    const [result] = await pool.query(
      'INSERT INTO addons (name, customer_price, partner_cost) VALUES (?, ?, ?)',
      [name, customer_price, partner_cost ?? null]
    );

    return res.status(201).json({ id: (result as any).insertId });
  } catch (err) {
    console.error('[POST /api/addons]', err);
    return res.status(500).json({ error: 'Failed to create add-on.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, customer_price, partner_cost } = req.body;
    const [result] = await pool.query(
      'UPDATE addons SET name = ?, customer_price = ?, partner_cost = ? WHERE id = ?',
      [name, customer_price, partner_cost ?? null, req.params.id]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: 'Add-on not found.' });
    }

    return res.status(200).json({ message: 'Add-on updated successfully.' });
  } catch (err) {
    console.error('[PUT /api/addons/:id]', err);
    return res.status(500).json({ error: 'Failed to update add-on.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM addons WHERE id = ?', [req.params.id]);

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: 'Add-on not found.' });
    }

    return res.status(200).json({ message: 'Add-on deleted successfully.' });
  } catch (err) {
    console.error('[DELETE /api/addons/:id]', err);
    return res.status(500).json({ error: 'Failed to delete add-on.' });
  }
});

router.get('/:id/links', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sa.id as link_id, sa.service_id, sa.category_id, a.id as addon_id, a.name as addon_name,
              cs.name as service_name, cc.name as category_name
       FROM service_addons sa
       JOIN addons a ON sa.addon_id = a.id
       LEFT JOIN catalog_services cs ON sa.service_id = cs.id
       LEFT JOIN catalog_categories cc ON sa.category_id = cc.id
       WHERE sa.addon_id = ?`,
      [req.params.id]
    );
    return res.status(200).json({ data: rows });
  } catch (err) {
    console.error('[GET /api/addons/:id/links]', err);
    return res.status(500).json({ error: 'Failed to fetch add-on links.' });
  }
});

router.post('/:id/link', async (req, res) => {
  try {
    const { service_id, category_id } = req.body;
    if (!service_id && !category_id) {
      return res.status(400).json({ error: 'service_id or category_id is required.' });
    }

    const [result] = await pool.query(
      'INSERT INTO service_addons (service_id, category_id, addon_id) VALUES (?, ?, ?)',
      [service_id || null, category_id || null, req.params.id]
    );

    return res.status(201).json({ id: (result as any).insertId });
  } catch (err) {
    console.error('[POST /api/addons/:id/link]', err);
    return res.status(500).json({ error: 'Failed to link add-on.' });
  }
});

router.delete('/links/:linkId', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM service_addons WHERE id = ?', [req.params.linkId]);

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: 'Link not found.' });
    }

    return res.status(200).json({ message: 'Link removed successfully.' });
  } catch (err) {
    console.error('[DELETE /api/addons/links/:linkId]', err);
    return res.status(500).json({ error: 'Failed to remove link.' });
  }
});

export default router;
