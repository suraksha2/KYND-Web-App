import { Router } from 'express';
import pool from '../lib/mysql';

const router = Router();

const DEFAULT_MARKUP_PCT = 30;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function safeJson(value: any, fallback: any = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function minutesFromTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function markupPct(override: number | null | undefined) {
  return (override ?? DEFAULT_MARKUP_PCT) / 100;
}

/** Crew size: a positive whole number, or null when it is not specified. */
function workerCount(value: any) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function rateType(value: any) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s || null;
}

/**
 * Customer price for a catalog row. A `flat` rule is authoritative — it holds
 * the negotiated listed price; everything else falls back to cost x markup.
 * Mirrors sellPrice() in the storefront's src/lib/catalogServices.js.
 */
function sellPrice(service: any): number | null {
  if (service.pricing_strategy === 'flat') {
    const amount = Number(service.pricing_params?.amount);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  if (service.pricing_strategy === 'custom_quote') return null;

  const cost = service.default_partner_cost !== null ? Number(service.default_partner_cost) : null;
  if (cost === null || Number.isNaN(cost)) return null;
  return Math.round(cost * (1 + markupPct(service.markup_pct_override)));
}

function resolveHourlyRate(params: any, startTime: string) {
  const schedule = Array.isArray(params?.rate_schedule) ? params.rate_schedule : null;
  if (!schedule) {
    if (typeof params?.rate === 'number') return Number(params.rate);
    return null;
  }

  const startMin = minutesFromTime(startTime);
  if (startMin === null) return null;

  for (const window of schedule) {
    const s = minutesFromTime(window.start);
    const e = minutesFromTime(window.end);
    if (s === null || e === null) continue;
    if (startMin >= s && startMin < e) return Number(window.rate);
  }

  return null;
}

function computeBaseCost(rule: any, durationHours: number, partySize: number, startTime: string) {
  const { strategy, params } = rule;
  let rate = 0;
  let cost = 0;

  switch (strategy) {
    case 'hourly': {
      rate = resolveHourlyRate(params, startTime) ?? 0;
      cost = roundMoney(rate * durationHours);
      break;
    }
    case 'per_unit': {
      rate = Number(params?.rate ?? 0);
      cost = roundMoney(rate * partySize);
      break;
    }
    case 'flat': {
      cost = roundMoney(Number(params?.amount ?? 0));
      break;
    }
    case 'tiered': {
      const tiers = Array.isArray(params?.tiers) ? params.tiers : [];
      const sorted = [...tiers]
        .filter((t: any) => typeof t.up_to === 'number' && !Number.isNaN(t.up_to))
        .sort((a: any, b: any) => a.up_to - b.up_to);
      const tier = sorted.find((t: any) => partySize <= t.up_to) || sorted[sorted.length - 1];
      if (tier && typeof tier.amount === 'number') {
        cost = roundMoney(tier.amount);
        rate = partySize > 0 ? roundMoney(cost / partySize) : 0;
      } else {
        cost = 0;
      }
      break;
    }
    case 'custom_quote': {
      return { cost: null as number | null, rate: null as number | null };
    }
    default:
      cost = 0;
  }

  return { cost, rate };
}

router.get('/categories', async (_req, res) => {
  try {
    // subcategory_count lets the storefront skip the drill-down for categories
    // that have nothing underneath them yet. Add-on groups do not count: they
    // are never shown in the grid. Subcategories placed here from another
    // category count too.
    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.description, c.image, c.sort_order, c.variant_schema, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM catalog_subcategories sc
                WHERE sc.is_addon = 0
                  AND (sc.category_id = c.id OR EXISTS (
                    SELECT 1 FROM catalog_subcategory_placements p
                     WHERE p.subcategory_id = sc.id AND p.category_id = c.id))) AS subcategory_count
       FROM catalog_categories c
       ORDER BY c.sort_order, c.name`
    );
    const data = (rows as any[]).map((c) => ({
      ...c,
      subcategory_count: Number(c.subcategory_count),
      variant_schema: safeJson(c.variant_schema, []),
    }));
    return res.status(200).json({ data });
  } catch (err) {
    console.error('[GET /api/catalog/categories]', err);
    return res.status(500).json({ error: 'Failed to fetch categories.' });
  }
});

router.get('/categories/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM catalog_categories WHERE id = ?', [req.params.id]);
    const categories = rows as any[];
    if (!categories.length) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    return res.status(200).json({ data: { ...categories[0], variant_schema: safeJson(categories[0].variant_schema, []) } });
  } catch (err) {
    console.error('[GET /api/catalog/categories/:id]', err);
    return res.status(500).json({ error: 'Failed to fetch category.' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { name, description, image, sort_order, variant_schema } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const [result] = await pool.query(
      'INSERT INTO catalog_categories (name, description, image, sort_order, variant_schema) VALUES (?, ?, ?, ?, ?)',
      [
        name.trim(),
        description?.trim() || null,
        image?.trim() || null,
        Number(sort_order) || 0,
        JSON.stringify(variant_schema || []),
      ]
    );

    return res.status(201).json({ id: Number((result as any).insertId) });
  } catch (err) {
    console.error('[POST /api/catalog/categories]', err);
    return res.status(500).json({ error: 'Failed to create category.' });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const { name, description, image, sort_order, variant_schema } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const [result] = await pool.query(
      'UPDATE catalog_categories SET name = ?, description = ?, image = ?, sort_order = ?, variant_schema = ? WHERE id = ?',
      [
        name.trim(),
        description?.trim() || null,
        image?.trim() || null,
        Number(sort_order) || 0,
        JSON.stringify(variant_schema || []),
        req.params.id,
      ]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    return res.status(200).json({ message: 'Category updated successfully.' });
  } catch (err) {
    console.error('[PUT /api/catalog/categories/:id]', err);
    return res.status(500).json({ error: 'Failed to update category.' });
  }
});

// Subcategories — the middle level between a category and its services.
router.get('/subcategories', async (req, res) => {
  try {
    const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
    if (req.query.category_id && Number.isNaN(categoryId)) {
      return res.status(400).json({ error: 'category_id must be a number.' });
    }

    // `placements` lists the other categories a subcategory is also shown
    // under, each with its position there; category_id stays the home one.
    const [rows] = await pool.query(
      `SELECT sc.id, sc.category_id, sc.name, sc.description, sc.is_addon, sc.image, sc.sort_order,
              sc.created_at, sc.updated_at,
              c.name AS category,
              COUNT(s.id) AS service_count,
              (SELECT GROUP_CONCAT(CONCAT(p.category_id, ':', p.sort_order))
                 FROM catalog_subcategory_placements p WHERE p.subcategory_id = sc.id) AS placements
       FROM catalog_subcategories sc
       JOIN catalog_categories c ON sc.category_id = c.id
       LEFT JOIN catalog_services s ON s.subcategory_id = sc.id
       ${categoryId !== null
         ? `WHERE sc.category_id = ? OR EXISTS (
              SELECT 1 FROM catalog_subcategory_placements p
               WHERE p.subcategory_id = sc.id AND p.category_id = ?)`
         : ''}
       GROUP BY sc.id
       ORDER BY c.sort_order, c.name, sc.sort_order, sc.name`,
      categoryId !== null ? [categoryId, categoryId] : []
    );

    const data = (rows as any[]).map((sc) => ({
      ...sc,
      service_count: Number(sc.service_count),
      is_addon: Boolean(sc.is_addon),
      // "5:2,6:1" -> [{category_id: 5, sort_order: 2}, ...]. GROUP_CONCAT rather
      // than JSON_ARRAYAGG, which XAMPP's MariaDB 10.4 lacks.
      placements: sc.placements
        ? String(sc.placements).split(',').map((pair) => {
            const [category_id, sort_order] = pair.split(':').map(Number);
            return { category_id, sort_order };
          })
        : [],
    }));
    return res.status(200).json({ data });
  } catch (err) {
    console.error('[GET /api/catalog/subcategories]', err);
    return res.status(500).json({ error: 'Failed to fetch subcategories.' });
  }
});

router.get('/subcategories/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sc.*, c.name AS category
       FROM catalog_subcategories sc
       JOIN catalog_categories c ON sc.category_id = c.id
       WHERE sc.id = ?`,
      [req.params.id]
    );
    const subcategories = rows as any[];
    if (!subcategories.length) {
      return res.status(404).json({ error: 'Subcategory not found.' });
    }
    return res.status(200).json({ data: subcategories[0] });
  } catch (err) {
    console.error('[GET /api/catalog/subcategories/:id]', err);
    return res.status(500).json({ error: 'Failed to fetch subcategory.' });
  }
});

router.post('/subcategories', async (req, res) => {
  try {
    const { category_id, name, description, is_addon, image, sort_order } = req.body;
    if (!category_id || !name?.trim()) {
      return res.status(400).json({ error: 'category_id and name are required.' });
    }

    const [result] = await pool.query(
      'INSERT INTO catalog_subcategories (category_id, name, description, is_addon, image, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [category_id, name.trim(), description?.trim() || null, is_addon ? 1 : 0, image?.trim() || null, Number(sort_order) || 0]
    );

    return res.status(201).json({ id: Number((result as any).insertId) });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That subcategory already exists in this category.' });
    }
    console.error('[POST /api/catalog/subcategories]', err);
    return res.status(500).json({ error: 'Failed to create subcategory.' });
  }
});

router.put('/subcategories/:id', async (req, res) => {
  try {
    const { category_id, name, description, is_addon, image, sort_order } = req.body;
    if (!category_id || !name?.trim()) {
      return res.status(400).json({ error: 'category_id and name are required.' });
    }

    const [result] = await pool.query(
      `UPDATE catalog_subcategories
       SET category_id = ?, name = ?, description = ?, is_addon = ?, image = ?, sort_order = ?
       WHERE id = ?`,
      [
        category_id,
        name.trim(),
        description?.trim() || null,
        is_addon ? 1 : 0,
        image?.trim() || null,
        Number(sort_order) || 0,
        req.params.id,
      ]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: 'Subcategory not found.' });
    }
    return res.status(200).json({ message: 'Subcategory updated successfully.' });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That subcategory already exists in this category.' });
    }
    console.error('[PUT /api/catalog/subcategories/:id]', err);
    return res.status(500).json({ error: 'Failed to update subcategory.' });
  }
});

// Services under a deleted subcategory are kept and fall back to unassigned
// (subcategory_id ON DELETE SET NULL), so this never destroys catalog rows.
router.delete('/subcategories/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM catalog_subcategories WHERE id = ?', [req.params.id]);
    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: 'Subcategory not found.' });
    }
    return res.status(200).json({ message: 'Subcategory deleted successfully.' });
  } catch (err) {
    console.error('[DELETE /api/catalog/subcategories/:id]', err);
    return res.status(500).json({ error: 'Failed to delete subcategory.' });
  }
});

router.get('/services', async (req, res) => {
  try {
    const filters: string[] = [];
    const params: any[] = [];
    if (req.query.category_id) {
      filters.push('s.category_id = ?');
      params.push(Number(req.query.category_id));
    }
    if (req.query.subcategory_id) {
      filters.push('s.subcategory_id = ?');
      params.push(Number(req.query.subcategory_id));
    }

    // The primary pricing rule carries the authoritative sell price, so the
    // storefront does not have to re-derive it from cost x markup (which rounds
    // to a different dollar on some rows).
    const [rows] = await pool.query(
      `SELECT s.id, s.name, s.description, s.image, s.duration, s.worker_count, s.rate_type, s.status,
              s.default_partner_cost, s.markup_pct_override,
              c.id as category_id, c.name as category,
              sc.id as subcategory_id, sc.name as subcategory, sc.is_addon as subcategory_is_addon,
              pr.strategy as pricing_strategy, pr.params as pricing_params
       FROM catalog_services s
       JOIN catalog_categories c ON s.category_id = c.id
       LEFT JOIN catalog_subcategories sc ON s.subcategory_id = sc.id
       LEFT JOIN service_pricing_rules pr
         ON pr.id = (SELECT MIN(id) FROM service_pricing_rules WHERE service_id = s.id)
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY s.name`,
      params
    );
    const data = (rows as any[]).map((s) => ({
      ...s,
      pricing_params: safeJson(s.pricing_params, {}),
      subcategory_is_addon: Boolean(s.subcategory_is_addon),
    }));
    return res.status(200).json({ data });
  } catch (err) {
    console.error('[GET /api/catalog/services]', err);
    return res.status(500).json({ error: 'Failed to fetch services.' });
  }
});

router.get('/services/:id', async (req, res) => {
  try {
    const [serviceRows] = await pool.query(
      `SELECT s.*, c.name as category, c.variant_schema, sc.name as subcategory
       FROM catalog_services s
       JOIN catalog_categories c ON s.category_id = c.id
       LEFT JOIN catalog_subcategories sc ON s.subcategory_id = sc.id
       WHERE s.id = ?`,
      [req.params.id]
    );
    const services = serviceRows as any[];
    if (!services.length) {
      return res.status(404).json({ error: 'Service not found.' });
    }

    const serviceId = req.params.id;
    const [modeRows] = await pool.query('SELECT * FROM service_booking_modes WHERE service_id = ?', [serviceId]);
    const [pricingRows] = await pool.query('SELECT * FROM service_pricing_rules WHERE service_id = ?', [serviceId]);
    const [addonRows] = await pool.query(
      `SELECT a.* FROM addons a
       JOIN service_addons sa ON a.id = sa.addon_id
       WHERE sa.service_id = ? OR sa.category_id = (SELECT category_id FROM catalog_services WHERE id = ?)`,
      [serviceId, serviceId]
    );
    const [variantRows] = await pool.query('SELECT * FROM service_variant_attributes WHERE service_id = ?', [serviceId]);

    const service = { ...services[0], variant_schema: safeJson(services[0].variant_schema, []) };
    const parsedPricing = (pricingRows as any[]).map((r) => ({ ...r, params: safeJson(r.params, {}) }));
    const parsedModes = (modeRows as any[]).map((m) => ({ ...m, blackout_dates: safeJson(m.blackout_dates, []) }));

    return res.status(200).json({
      data: {
        ...service,
        booking_modes: parsedModes,
        pricing_rules: parsedPricing,
        addons: addonRows,
        variants: variantRows,
      },
    });
  } catch (err) {
    console.error('[GET /api/catalog/services/:id]', err);
    return res.status(500).json({ error: 'Failed to fetch service.' });
  }
});

router.post('/services', async (req, res) => {
  const {
    name,
    category_id,
    subcategory_id,
    description,
    image,
    duration,
    worker_count,
    rate_type,
    status,
    default_partner_cost,
    markup_pct_override,
    pricing_rules = [],
    booking_modes = [],
    variants = [],
  } = req.body;

  if (!name || !category_id) {
    return res.status(400).json({ error: 'name and category_id are required.' });
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const [insertResult] = await connection.query(
      `INSERT INTO catalog_services (category_id, subcategory_id, name, description, image, duration, worker_count, rate_type, status, default_partner_cost, markup_pct_override)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category_id,
        subcategory_id ?? null,
        name,
        description || null,
        image || null,
        duration || null,
        workerCount(worker_count),
        rateType(rate_type),
        status || 'pending_rates',
        default_partner_cost ?? null,
        markup_pct_override ?? null,
      ]
    );

    const serviceId = Number((insertResult as any).insertId);

    for (const rule of pricing_rules) {
      await connection.query(
        `INSERT INTO service_pricing_rules (service_id, strategy, params) VALUES (?, ?, ?)`,
        [serviceId, rule.strategy, JSON.stringify(rule.params || {})]
      );
    }

    for (const mode of booking_modes) {
      await connection.query(
        `INSERT INTO service_booking_modes (service_id, mode, min_lead_time_hours, blackout_dates, recurrence_frequency, recurrence_discount_pct)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          serviceId,
          mode.mode,
          mode.min_lead_time_hours ?? null,
          JSON.stringify(mode.blackout_dates || []),
          mode.recurrence_frequency ?? null,
          mode.recurrence_discount_pct ?? null,
        ]
      );
    }

    for (const v of variants) {
      await connection.query(
        `INSERT INTO service_variant_attributes (service_id, attribute_key, attribute_value)
         VALUES (?, ?, ?)`,
        [serviceId, v.attribute_key, v.attribute_value ?? null]
      );
    }

    await connection.commit();
    return res.status(201).json({ id: serviceId });
  } catch (err) {
    await connection.rollback();
    console.error('[POST /api/catalog/services]', err);
    return res.status(500).json({ error: 'Failed to create service.' });
  } finally {
    connection.release();
  }
});

router.put('/services/:id', async (req, res) => {
  const serviceId = req.params.id;
  const {
    name,
    category_id,
    subcategory_id,
    description,
    image,
    duration,
    worker_count,
    rate_type,
    status,
    default_partner_cost,
    markup_pct_override,
    pricing_rules = [],
    booking_modes = [],
    variants = [],
  } = req.body;

  if (!name || !category_id) {
    return res.status(400).json({ error: 'name and category_id are required.' });
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const [updateResult] = await connection.query(
      `UPDATE catalog_services
       SET category_id = ?, subcategory_id = ?, name = ?, description = ?, image = ?, duration = ?, worker_count = ?, rate_type = ?, status = ?, default_partner_cost = ?, markup_pct_override = ?
       WHERE id = ?`,
      [
        category_id,
        subcategory_id ?? null,
        name,
        description || null,
        image || null,
        duration || null,
        workerCount(worker_count),
        rateType(rate_type),
        status || 'pending_rates',
        default_partner_cost ?? null,
        markup_pct_override ?? null,
        serviceId,
      ]
    );

    if ((updateResult as any).affectedRows === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Service not found.' });
    }

    await connection.query('DELETE FROM service_pricing_rules WHERE service_id = ?', [serviceId]);
    for (const rule of pricing_rules) {
      await connection.query(
        `INSERT INTO service_pricing_rules (service_id, strategy, params) VALUES (?, ?, ?)`,
        [serviceId, rule.strategy, JSON.stringify(rule.params || {})]
      );
    }

    await connection.query('DELETE FROM service_booking_modes WHERE service_id = ?', [serviceId]);
    for (const mode of booking_modes) {
      await connection.query(
        `INSERT INTO service_booking_modes (service_id, mode, min_lead_time_hours, blackout_dates, recurrence_frequency, recurrence_discount_pct)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          serviceId,
          mode.mode,
          mode.min_lead_time_hours ?? null,
          JSON.stringify(mode.blackout_dates || []),
          mode.recurrence_frequency ?? null,
          mode.recurrence_discount_pct ?? null,
        ]
      );
    }

    await connection.query('DELETE FROM service_variant_attributes WHERE service_id = ?', [serviceId]);
    for (const v of variants) {
      await connection.query(
        `INSERT INTO service_variant_attributes (service_id, attribute_key, attribute_value)
         VALUES (?, ?, ?)`,
        [serviceId, v.attribute_key, v.attribute_value ?? null]
      );
    }

    await connection.commit();
    return res.status(200).json({ message: 'Service updated successfully.' });
  } catch (err) {
    await connection.rollback();
    console.error('[PUT /api/catalog/services/:id]', err);
    return res.status(500).json({ error: 'Failed to update service.' });
  } finally {
    connection.release();
  }
});

router.delete('/services/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM catalog_services WHERE id = ?', [req.params.id]);

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: 'Service not found.' });
    }

    return res.status(200).json({ message: 'Service deleted successfully.' });
  } catch (err) {
    console.error('[DELETE /api/catalog/services/:id]', err);
    return res.status(500).json({ error: 'Failed to delete service.' });
  }
});

// Two things can be offered as an add-on, so both are merged here: a row in
// `addons` linked through `service_addons`, and a catalog service that lives in
// one of the category's add-on subcategories (ceiling fan, oven, grilles, ...).
// `key` disambiguates the two id spaces for the client.
router.get('/services/:id/addons', async (req, res) => {
  try {
    const serviceId = req.params.id;
    const [linkedRows] = await pool.query(
      `SELECT a.id, a.name, a.customer_price
       FROM addons a
       JOIN service_addons sa ON a.id = sa.addon_id
       WHERE sa.service_id = ?
          OR sa.category_id = (SELECT category_id FROM catalog_services WHERE id = ?)
       ORDER BY a.name`,
      [serviceId, serviceId]
    );

    const [catalogRows] = await pool.query(
      `SELECT s.id, s.name, s.duration, s.worker_count, s.rate_type,
              s.default_partner_cost, s.markup_pct_override,
              pr.strategy as pricing_strategy, pr.params as pricing_params
       FROM catalog_services s
       JOIN catalog_subcategories sc ON s.subcategory_id = sc.id
       LEFT JOIN service_pricing_rules pr
         ON pr.id = (SELECT MIN(id) FROM service_pricing_rules WHERE service_id = s.id)
       WHERE sc.is_addon = 1
         AND s.status = 'live'
         AND s.id <> ?
         AND s.category_id = (SELECT category_id FROM catalog_services WHERE id = ?)
       ORDER BY s.name`,
      [serviceId, serviceId]
    );

    const data = [
      ...(linkedRows as any[]).map((a) => ({
        key: `addon:${a.id}`,
        source: 'addon',
        id: a.id,
        name: a.name,
        customer_price: a.customer_price,
        duration: null,
        worker_count: null,
        rate_type: null,
      })),
      ...(catalogRows as any[])
        .map((s) => ({
          key: `service:${s.id}`,
          source: 'service',
          id: s.id,
          name: s.name,
          customer_price: sellPrice({ ...s, pricing_params: safeJson(s.pricing_params, {}) }),
          duration: s.duration,
          worker_count: s.worker_count,
          rate_type: s.rate_type,
        }))
        // A quote-on-request item cannot be ticked on a fixed-price booking.
        .filter((s) => s.customer_price !== null),
    ];

    return res.status(200).json({ data });
  } catch (err) {
    console.error('[GET /api/catalog/services/:id/addons]', err);
    return res.status(500).json({ error: 'Failed to fetch add-ons.' });
  }
});

router.get('/services/:id/quote', async (req, res) => {
  try {
    const serviceId = req.params.id;
    const duration = Math.max(0, Number(req.query.duration_hours || 1));
    const partySize = Math.max(1, Number(req.query.party_size || 1));
    const startTime = String(req.query.start_time || '08:00');
    const addonIdsParam = req.query.addon_ids
      ? String(req.query.addon_ids)
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => !Number.isNaN(n))
      : [];

    const [serviceRows] = await pool.query(
      `SELECT s.*, c.name as category, c.variant_schema
       FROM catalog_services s
       JOIN catalog_categories c ON s.category_id = c.id
       WHERE s.id = ?`,
      [serviceId]
    );
    const services = serviceRows as any[];
    if (!services.length) {
      return res.status(404).json({ error: 'Service not found.' });
    }
    const service = services[0];

    const [ruleRows] = await pool.query(
      'SELECT * FROM service_pricing_rules WHERE service_id = ? ORDER BY id LIMIT 1',
      [serviceId]
    );
    const rules = ruleRows as any[];
    if (!rules.length) {
      return res.status(400).json({ error: 'No pricing rule configured for this service.' });
    }
    const rule = { ...rules[0], params: safeJson(rules[0].params, {}) };

    const { cost: baseCost, rate } = computeBaseCost(rule, duration, partySize, startTime);

    if (rule.strategy === 'custom_quote' || baseCost === null) {
      return res.status(200).json({
        service_id: serviceId,
        strategy: rule.strategy,
        cost: null,
        sell: null,
      });
    }

    const markup = markupPct(service.markup_pct_override);
    const baseSell = Math.round(baseCost * (1 + markup));

    let addonCost = 0;
    let addonSell = 0;
    const addonItems = [];

    if (addonIdsParam.length > 0) {
      const placeholders = addonIdsParam.map(() => '?').join(',');
      const [addonRows] = await pool.query(
        `SELECT a.* FROM addons a
         WHERE a.id IN (${placeholders})
           AND a.id IN (
             SELECT addon_id FROM service_addons
             WHERE (service_id = ? OR category_id = ?)
           )`,
        [...addonIdsParam, serviceId, service.category_id]
      );

      for (const a of addonRows as any[]) {
        const cost = Number(a.partner_cost ?? 0);
        const sell = Number(a.customer_price ?? roundMoney(cost * (1 + markup)));
        addonCost += cost;
        addonSell += sell;
        addonItems.push({ id: a.id, name: a.name, cost, sell });
      }
    }

    const totalCost = roundMoney((baseCost ?? 0) + addonCost);
    const totalSell = Math.round(baseSell + addonSell);

    return res.status(200).json({
      service_id: serviceId,
      strategy: rule.strategy,
      rate,
      duration_hours: duration,
      party_size: partySize,
      start_time: startTime,
      cost: totalCost,
      sell: totalSell,
      markup_pct: (markup * 100),
      addons: addonItems,
    });
  } catch (err) {
    console.error('[GET /api/catalog/services/:id/quote]', err);
    return res.status(500).json({ error: 'Failed to calculate quote.' });
  }
});

export default router;
