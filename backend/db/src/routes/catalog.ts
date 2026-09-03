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
    const [rows] = await pool.query('SELECT id, name, variant_schema, created_at, updated_at FROM catalog_categories ORDER BY name');
    const data = (rows as any[]).map((c) => ({ ...c, variant_schema: safeJson(c.variant_schema, []) }));
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
    const { name, description, variant_schema } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const [result] = await pool.query(
      'INSERT INTO catalog_categories (name, description, variant_schema) VALUES (?, ?, ?)',
      [name.trim(), description?.trim() || null, JSON.stringify(variant_schema || [])]
    );

    return res.status(201).json({ id: Number((result as any).insertId) });
  } catch (err) {
    console.error('[POST /api/catalog/categories]', err);
    return res.status(500).json({ error: 'Failed to create category.' });
  }
});

router.get('/services', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.name, s.description, s.image, s.duration, s.status, s.default_partner_cost, s.markup_pct_override, c.id as category_id, c.name as category
       FROM catalog_services s
       JOIN catalog_categories c ON s.category_id = c.id
       ORDER BY s.name`
    );
    return res.status(200).json({ data: rows });
  } catch (err) {
    console.error('[GET /api/catalog/services]', err);
    return res.status(500).json({ error: 'Failed to fetch services.' });
  }
});

router.get('/services/:id', async (req, res) => {
  try {
    const [serviceRows] = await pool.query(
      `SELECT s.*, c.name as category, c.variant_schema
       FROM catalog_services s
       JOIN catalog_categories c ON s.category_id = c.id
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
    description,
    image,
    duration,
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
      `INSERT INTO catalog_services (category_id, name, description, image, duration, status, default_partner_cost, markup_pct_override)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category_id,
        name,
        description || null,
        image || null,
        duration || null,
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
    description,
    image,
    duration,
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
       SET category_id = ?, name = ?, description = ?, image = ?, duration = ?, status = ?, default_partner_cost = ?, markup_pct_override = ?
       WHERE id = ?`,
      [
        category_id,
        name,
        description || null,
        image || null,
        duration || null,
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

router.get('/services/:id/addons', async (req, res) => {
  try {
    const serviceId = req.params.id;
    const [addonRows] = await pool.query(
      `SELECT a.id, a.name, a.customer_price
       FROM addons a
       JOIN service_addons sa ON a.id = sa.addon_id
       WHERE sa.service_id = ?
          OR sa.category_id = (SELECT category_id FROM catalog_services WHERE id = ?)
       ORDER BY a.name`,
      [serviceId, serviceId]
    );
    return res.status(200).json({ data: addonRows });
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
