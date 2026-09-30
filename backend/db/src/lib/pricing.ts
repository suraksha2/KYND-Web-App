import pool from './mysql';
import {
  computePartnerCostFromRule,
  loadPricingRulesByServiceIds,
  markupPct,
  parseDurationHours,
  startTimeFromScheduledAt,
} from './pricingRules';

const RECURRING_DISCOUNT = 0.85;
const MAX_ORDER_TOTAL = 50_000;

export class PricingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function slugify(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function computeOfferDiscount(
  offerId: string | undefined | null,
  subtotal: number,
  serviceCount: number
): number {
  if (!offerId || !Number.isFinite(subtotal) || subtotal <= 0) return 0;
  if (offerId === 'first') return Math.min(subtotal, 10);
  if (offerId === 'refer') return Math.min(subtotal, 15);
  if (offerId === 'bundle') {
    if (serviceCount < 3) return 0;
    return Math.round(subtotal * 0.15);
  }
  return 0;
}

async function resolveEligibleOfferId(
  userId: number | undefined,
  requested: string | null,
  serviceLineCount: number
): Promise<string | null> {
  if (!requested) return null;
  if (requested === 'bundle') {
    return serviceLineCount >= 3 ? 'bundle' : null;
  }
  if (requested === 'refer') {
    return 'refer';
  }
  if (requested === 'first') {
    if (!userId) return null;
    const [rows]: any = await pool.query(
      `SELECT id FROM bookings
       WHERE user_id = ? AND status IN ('upcoming', 'completed')
       LIMIT 1`,
      [userId]
    );
    if (rows?.length) return null;
    return 'first';
  }
  return null;
}

type RawItem = {
  catalogId?: number | string;
  id?: number | string;
  name?: string;
  slug?: string;
  qty?: number;
  duration?: string;
  img?: string;
};

type RawAddon = { id?: number | string };

export type PricedOrder = {
  total: number;
  discount: number;
  offerId: string | null;
  items: Array<{
    catalogId: number;
    slug: string;
    name: string;
    img: string | null;
    priceFrom: number;
    duration: string | null;
    qty: number;
  }>;
  addOns: Array<{ id: number; name: string; price: number }>;
};

/**
 * Recompute checkout total from catalog + pricing rules + addons.
 * Client-supplied prices/totals are ignored.
 */
export async function priceOrder(input: {
  items: RawItem[];
  addOns?: RawAddon[];
  schedule?: string;
  offer?: { id?: string } | string | null;
  userId?: number;
  scheduledAt?: string | null;
}): Promise<PricedOrder> {
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (!rawItems.length) {
    throw new PricingError('At least one service item is required.');
  }

  const [serviceRows] = await pool.query(
    `SELECT id, name, image, duration, default_partner_cost, markup_pct_override, status
     FROM catalog_services`
  );
  const catalog = serviceRows as any[];
  const byId = new Map<number, any>();
  const bySlug = new Map<string, any>();
  for (const s of catalog) {
    byId.set(Number(s.id), s);
    bySlug.set(slugify(s.name), s);
  }

  const resolvedServices: any[] = [];
  const pricedItems: PricedOrder['items'] = [];

  for (const raw of rawItems) {
    const qty = Math.max(1, Math.min(20, Number(raw.qty) || 1));
    const idHint = Number(raw.catalogId ?? raw.id);
    let service =
      (Number.isFinite(idHint) && byId.get(idHint)) ||
      (raw.slug && bySlug.get(slugify(raw.slug))) ||
      (raw.name && bySlug.get(slugify(raw.name))) ||
      null;

    if (!service) {
      throw new PricingError(`Unknown service: ${raw.name || raw.slug || raw.id || 'item'}`);
    }
    if (service.status && service.status !== 'live') {
      throw new PricingError(`Service "${service.name}" is not available.`);
    }
    resolvedServices.push({ service, qty, raw });
  }

  const ruleMap = await loadPricingRulesByServiceIds(
    resolvedServices.map((r) => Number(r.service.id))
  );
  const startTime = startTimeFromScheduledAt(input.scheduledAt);

  let base = 0;
  for (const { service, qty, raw } of resolvedServices) {
    const rule = ruleMap.get(Number(service.id));
    let partnerCost: number | null = null;

    if (rule && rule.strategy !== 'custom_quote') {
      const durationHours = parseDurationHours(raw.duration || service.duration);
      partnerCost = computePartnerCostFromRule(rule, {
        durationHours,
        partySize: qty,
        startTime,
      });
    }

    if (partnerCost === null || !Number.isFinite(partnerCost)) {
      const fallback = service.default_partner_cost !== null ? Number(service.default_partner_cost) : null;
      if (fallback === null || !Number.isFinite(fallback)) {
        throw new PricingError(
          `Service "${service.name}" requires a custom quote and cannot be booked online.`
        );
      }
      partnerCost = fallback;
    }

    const unit = Math.round(partnerCost * (1 + markupPct(service.markup_pct_override)));
    base += unit * qty;
    pricedItems.push({
      catalogId: Number(service.id),
      slug: slugify(service.name),
      name: service.name,
      img: service.image || raw.img || null,
      priceFrom: unit,
      duration: service.duration || raw.duration || null,
      qty,
    });
  }

  if (input.schedule === 'recurring') {
    base = Math.round(base * RECURRING_DISCOUNT);
  }

  const addonIds = (Array.isArray(input.addOns) ? input.addOns : [])
    .map((a) => Number(a?.id))
    .filter((n) => Number.isFinite(n) && n > 0);
  const uniqueAddonIds = [...new Set(addonIds)];
  const pricedAddOns: PricedOrder['addOns'] = [];
  let addonTotal = 0;

  if (uniqueAddonIds.length) {
    const serviceIds = pricedItems.map((i) => i.catalogId);
    const placeholders = uniqueAddonIds.map(() => '?').join(',');
    const servicePlaceholders = serviceIds.map(() => '?').join(',');
    const [addonRows] = await pool.query(
      `SELECT DISTINCT a.id, a.name, a.customer_price
       FROM addons a
       INNER JOIN service_addons sa ON sa.addon_id = a.id
       WHERE a.id IN (${placeholders})
         AND (
           sa.service_id IN (${servicePlaceholders})
           OR sa.category_id IN (
             SELECT category_id FROM catalog_services WHERE id IN (${servicePlaceholders})
           )
         )`,
      [...uniqueAddonIds, ...serviceIds, ...serviceIds]
    );

    const found = new Map((addonRows as any[]).map((a) => [Number(a.id), a]));
    for (const id of uniqueAddonIds) {
      const a = found.get(id);
      if (!a) throw new PricingError(`Invalid add-on: ${id}`);
      const price = Number(a.customer_price ?? 0);
      if (!Number.isFinite(price) || price < 0) {
        throw new PricingError(`Invalid add-on price for ${a.name}`);
      }
      addonTotal += price;
      pricedAddOns.push({ id: Number(a.id), name: a.name, price: roundMoney(price) });
    }
  }

  const requestedOffer =
    typeof input.offer === 'string'
      ? input.offer
      : input.offer && typeof input.offer === 'object'
        ? input.offer.id || null
        : null;

  const offerId = await resolveEligibleOfferId(
    input.userId,
    requestedOffer,
    pricedItems.length
  );

  const beforeDiscount = base + addonTotal;
  const discount = computeOfferDiscount(offerId, beforeDiscount, pricedItems.length);
  const total = roundMoney(Math.max(0, beforeDiscount - discount));

  if (!Number.isFinite(total) || total <= 0) {
    throw new PricingError('Order total must be greater than zero.');
  }
  if (total > MAX_ORDER_TOTAL) {
    throw new PricingError('Order total exceeds the allowed maximum.');
  }

  return {
    total,
    discount: roundMoney(discount),
    offerId,
    items: pricedItems,
    addOns: pricedAddOns,
  };
}

export { MAX_ORDER_TOTAL };
