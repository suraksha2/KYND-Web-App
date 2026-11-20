import type { Pool } from 'mysql2/promise';
import pool from './mysql';
import {
  computePartnerCostFromRule,
  loadPricingRulesByServiceIds,
  markupPct,
  parseCatalogDurationHours,
  startTimeFromScheduledAt,
} from './pricingRules';
import { officeRecurringVisitTotal, recurringDiscountPct } from './recurringPricing';

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
  if (offerId === 'bundle') {
    if (serviceCount < 3) return 0;
    return Math.round(subtotal * 0.15);
  }
  return 0;
}

type EligibleOffers = { offerId: string | null; referralCode: string | null };

type PricingDatabase = Pick<Pool, 'query'>;

async function resolveEligibleOffers(
  userId: number | undefined,
  requested: string | null,
  serviceLineCount: number,
  requestedReferralCode: string | undefined,
  paymentIntentId: string | undefined,
  db: PricingDatabase
): Promise<EligibleOffers> {
  let offerId: string | null = null;
  if (requested === 'bundle' && serviceLineCount >= 3) {
    offerId = 'bundle';
  }
  if (requested === 'first') {
    if (userId) {
      const [rows]: any = await db.query(
        `SELECT id FROM bookings
         WHERE user_id = ?
         LIMIT 1`,
        [userId]
      );
      if (!rows?.length) {
        const [redemptions]: any = await db.query(
          `SELECT status, payment_intent_id
             FROM first_booking_discount_redemptions
            WHERE user_id = ?
            LIMIT 1`,
          [userId]
        );
        const reservation = redemptions?.[0];
        const ownsReservation = reservation?.status === 'reserved'
          && typeof paymentIntentId === 'string'
          && reservation.payment_intent_id === paymentIntentId;
        if (!reservation || ownsReservation) offerId = 'first';
      }
    }
  }

  const referralCode = typeof requestedReferralCode === 'string'
    ? requestedReferralCode.trim().toUpperCase()
    : '';
  if (referralCode) {
    if (!userId || referralCode.length > 20) {
      throw new PricingError('Invalid referral code.');
    }
    const [referrers]: any = await db.query(
      `SELECT id FROM users
       WHERE referral_code = ? AND id <> ?
       LIMIT 1`,
      [referralCode, userId]
    );
    if (!referrers?.length) throw new PricingError('Invalid referral code.');
  }
  if (requested === 'refer' && !referralCode) {
    throw new PricingError('A valid referral code is required.');
  }

  return { offerId, referralCode: referralCode || null };
}

type RawItem = {
  catalogId?: number | string;
  id?: number | string;
  name?: string;
  slug?: string;
  qty?: number;
  duration?: string;
  img?: string;
  officeSize?: string;
};

type RawAddon = { id?: number | string; source?: string };

export type PricedOrder = {
  total: number;
  discount: number;
  offerId: string | null;
  referralCode: string | null;
  items: Array<{
    catalogId: number;
    slug: string;
    name: string;
    img: string | null;
    priceFrom: number;
    duration: string | null;
    qty: number;
  }>;
  addOns: Array<{ id: number; serviceId?: number; name: string; price: number }>;
};

/**
 * Recompute checkout total from catalog + pricing rules + addons.
 * Client-supplied prices/totals are ignored.
 */
export async function priceOrder(input: {
  items: RawItem[];
  addOns?: RawAddon[];
  schedule?: string;
  recurrence?: unknown;
  offer?: { id?: string } | string | null;
  userId?: number;
  scheduledAt?: string | null;
  referralCode?: string;
  paymentIntentId?: string;
}, db: PricingDatabase = pool): Promise<PricedOrder> {
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (!rawItems.length) {
    throw new PricingError('At least one service item is required.');
  }

  const [serviceRows] = await db.query(
    `SELECT s.id, s.name, s.image, s.duration, s.default_partner_cost,
            s.markup_pct_override, s.status, sc.booking_behavior,
            sc.office_pricing, cc.name AS category_name
       FROM catalog_services s
       LEFT JOIN catalog_subcategories sc ON sc.id = s.subcategory_id
       LEFT JOIN catalog_categories cc ON cc.id = s.category_id`
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
    resolvedServices.map((r) => Number(r.service.id)),
    db
  );
  const startTime = startTimeFromScheduledAt(input.scheduledAt);

  let base = 0;
  for (const { service, qty, raw } of resolvedServices) {
    const rule = ruleMap.get(Number(service.id));
    let unit: number | null = null;

    if (rule?.strategy === 'flat') {
      const amount = Number(rule.params?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new PricingError(`Service "${service.name}" does not have a valid customer price.`);
      }
      unit = roundMoney(amount);
    } else {
      if (rule?.strategy === 'custom_quote') {
        throw new PricingError(
          `Service "${service.name}" requires a custom quote and cannot be booked online.`
        );
      }

      let partnerCost: number | null = null;
      if (rule) {
        const durationHours = rule.strategy === 'hourly'
          ? parseCatalogDurationHours(service.duration)
          : 1;
        if (rule.strategy === 'hourly' && durationHours === null) {
          throw new PricingError(`Service "${service.name}" is missing a valid catalogue duration.`);
        }
        partnerCost = computePartnerCostFromRule(rule, {
          durationHours: durationHours ?? 1,
          partySize: qty,
          startTime,
        });
      }

      if (partnerCost === null || !Number.isFinite(partnerCost) || (rule?.strategy === 'hourly' && partnerCost <= 0)) {
        const fallback = service.default_partner_cost !== null ? Number(service.default_partner_cost) : null;
        if (
          fallback === null
          || !Number.isFinite(fallback)
          || (rule?.strategy === 'hourly' && fallback <= 0)
        ) {
          throw new PricingError(
            `Service "${service.name}" does not have a valid hourly price for the selected time.`
          );
        }
        partnerCost = fallback;
      }

      unit = Math.round(partnerCost * (1 + markupPct(service.markup_pct_override)));
    }

    base += unit * qty;
    pricedItems.push({
      catalogId: Number(service.id),
      slug: slugify(service.name),
      name: service.name,
      img: service.image || raw.img || null,
      priceFrom: unit,
      duration: service.duration || null,
      qty,
    });
  }

  let officePlanApplied = false;
  if (input.schedule === 'recurring' && resolvedServices.length === 1) {
    const { service, raw, qty } = resolvedServices[0];
    const behavior = service.booking_behavior;
    const isOfficePlan = (behavior === 'office_cleaning'
      || /office cleaning/i.test(String(service.category_name || '')))
      && ['threeWeek', 'daily'].includes(String((input.recurrence as any)?.plan || ''));
    if (isOfficePlan) {
      const visitTotal = officeRecurringVisitTotal(
        service,
        { officeSize: raw.officeSize, qty },
        input.recurrence,
        input.scheduledAt
      );
      if (visitTotal === null) {
        throw new PricingError('This office cleaning plan requires a custom quote.');
      }
      base = visitTotal;
      officePlanApplied = true;
    }
  }

  if (input.schedule === 'recurring' && !officePlanApplied) {
    const discountPct = recurringDiscountPct(
      resolvedServices.map(({ service }) => service),
      input.recurrence,
      input.scheduledAt
    );
    base = Math.round(base * (1 - discountPct));
  }

  // Add-ons come from two id spaces: `addons` rows (source 'addon') and
  // catalog services in an add-on subcategory (source 'service') — the
  // listing endpoint /catalog/services/:id/addons merges both for the client.
  const rawAddOns = Array.isArray(input.addOns) ? input.addOns : [];
  const uniqueAddonIds = [...new Set(
    rawAddOns
      .filter((a) => a?.source !== 'service')
      .map((a) => Number(a?.id))
      .filter((n) => Number.isFinite(n) && n > 0)
  )];
  const serviceAddonIds = [...new Set(
    rawAddOns
      .filter((a) => a?.source === 'service')
      .map((a) => Number(a?.id))
      .filter((n) => Number.isFinite(n) && n > 0)
  )];
  const pricedAddOns: PricedOrder['addOns'] = [];
  let addonTotal = 0;

  const serviceIds = pricedItems.map((i) => i.catalogId);
  const servicePlaceholders = serviceIds.map(() => '?').join(',');

  if (uniqueAddonIds.length) {
    const placeholders = uniqueAddonIds.map(() => '?').join(',');
    const [addonRows] = await db.query(
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

  // Service-sourced add-ons must be live catalog rows in an add-on
  // subcategory of a booked service's category — the same eligibility the
  // listing endpoint applies. Priced the way the listing displays them
  // (sellPrice: flat rule amount, else partner cost x markup).
  if (serviceAddonIds.length) {
    const placeholders = serviceAddonIds.map(() => '?').join(',');
    const [addonServiceRows] = await db.query(
      `SELECT s.id, s.name, s.default_partner_cost, s.markup_pct_override
         FROM catalog_services s
         JOIN catalog_subcategories sc ON s.subcategory_id = sc.id
        WHERE s.id IN (${placeholders})
          AND sc.is_addon = 1
          AND s.status = 'live'
          AND s.category_id IN (
            SELECT category_id FROM catalog_services WHERE id IN (${servicePlaceholders})
          )`,
      [...serviceAddonIds, ...serviceIds]
    );
    const addonRules = await loadPricingRulesByServiceIds(serviceAddonIds, db);
    const found = new Map((addonServiceRows as any[]).map((s) => [Number(s.id), s]));
    for (const id of serviceAddonIds) {
      const s: any = found.get(id);
      if (!s) throw new PricingError(`Invalid add-on: ${id}`);
      const rule = addonRules.get(id);
      let price: number | null = null;
      if (rule?.strategy === 'flat') {
        const amount = Number(rule.params?.amount);
        if (Number.isFinite(amount) && amount > 0) price = amount;
      } else if (rule?.strategy !== 'custom_quote') {
        const cost = s.default_partner_cost !== null ? Number(s.default_partner_cost) : null;
        if (cost !== null && Number.isFinite(cost)) {
          price = Math.round(cost * (1 + markupPct(s.markup_pct_override)));
        }
      }
      if (price === null || price < 0) {
        throw new PricingError(`Invalid add-on price for ${s.name}`);
      }
      addonTotal += price;
      pricedAddOns.push({ id, serviceId: id, name: s.name, price: roundMoney(price) });
    }
  }

  const requestedOffer =
    typeof input.offer === 'string'
      ? input.offer
      : input.offer && typeof input.offer === 'object'
        ? input.offer.id || null
        : null;

  const eligible = await resolveEligibleOffers(
    input.userId,
    requestedOffer,
    pricedItems.length,
    input.referralCode,
    input.paymentIntentId,
    db
  );

  const beforeDiscount = base + addonTotal;
  const offerDiscount = computeOfferDiscount(eligible.offerId, beforeDiscount, pricedItems.length);
  const referralDiscount = eligible.referralCode
    ? Math.min(beforeDiscount, 15)
    : 0;
  const discount = Math.min(beforeDiscount, offerDiscount + referralDiscount);
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
    offerId: eligible.offerId || (requestedOffer === 'refer' ? 'refer' : null),
    referralCode: eligible.referralCode,
    items: pricedItems,
    addOns: pricedAddOns,
  };
}

export { MAX_ORDER_TOTAL };
