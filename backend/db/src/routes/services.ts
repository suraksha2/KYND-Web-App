import { Router } from 'express';
import pool from '../lib/mysql';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const ids = req.query.ids;
    const slugs = req.query.slugs;

    let query = `SELECT id, name, category, price, availability, status, image, duration, rating, review_count FROM services`;
    const params: any[] = [];

    if (ids) {
      const idArray = String(ids).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (idArray.length > 0) {
        query += ` WHERE id IN (${idArray.map(() => '?').join(',')})`;
        params.push(...idArray);
      }
    } else if (slugs) {
      const slugArray = String(slugs).split(',').map(slug => slug.trim()).filter(slug => slug.length > 0);
      if (slugArray.length > 0) {
        // Convert slugs to names (slug is name lowercase with hyphens)
        const nameArray = slugArray.map(slug => slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
        query += ` WHERE name IN (${nameArray.map(() => '?').join(',')})`;
        params.push(...nameArray);
      }
    }

    const [rows] = await pool.query(query, params);
    return res.status(200).json({ data: rows });
  } catch (err) {
    console.error("[GET /api/services]", err);
    return res.status(500).json({ error: "Failed to fetch services." });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, category, price, availability, status, image } = req.body;
    if (!name || !price) {
      return res.status(400).json({ error: "Name and price are required." });
    }
    const [result] = await pool.query(
      `INSERT INTO services (name, category, price, availability, status, image) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, category || "General", price, availability || "Available", status || "Available", image || null]
    );
    return res.status(201).json({ id: (result as any).insertId });
  } catch (err) {
    console.error("[POST /api/services]", err);
    return res.status(500).json({ error: "Failed to create service." });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, category, price, availability, status, image } = req.body;
    if (!name || !price) {
      return res.status(400).json({ error: "Name and price are required." });
    }

    const [result] = await pool.query(
      `UPDATE services SET name = ?, category = ?, price = ?, availability = ?, status = ?, image = ? WHERE id = ?`,
      [name, category || "General", price, availability || "Available", status || "Available", image || null, req.params.id]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: "Service not found." });
    }

    return res.status(200).json({ message: "Service updated successfully." });
  } catch (err) {
    console.error("[PUT /api/services/[id]]", err);
    return res.status(500).json({ error: "Failed to update service." });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query(`DELETE FROM services WHERE id = ?`, [req.params.id]);

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: "Service not found." });
    }

    return res.status(200).json({ message: "Service deleted successfully." });
  } catch (err) {
    console.error("[DELETE /api/services/[id]]", err);
    return res.status(500).json({ error: "Failed to delete service." });
  }
});

export default router;
