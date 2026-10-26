import { Router } from 'express';
import pool from '../lib/mysql';
import { skillTagsForService, providerSupportsServices } from '../lib/providerSkills';
import { parseDurationMinutes, providerWorkingHours, isFreeAt, loadProviderSchedule } from '../lib/providerSchedule';
import { approvedVendorQuote, VendorPricingError } from '../lib/vendorFinance';

const router = Router();

const SLOT_STEP_MIN = 30;

function sgtDate(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+08:00`);
}

function sgtTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Singapore',
  }).format(d);
}

function sgtDayKey(date: string): string {
  const label = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Singapore',
  }).format(new Date(`${date}T12:00:00+08:00`));
  return label.toLowerCase();
}

function providerSlots(
  provider: any,
  date: string,
  durationMin: number,
  existingBookings: any[]
): string[] {
  const hours = providerWorkingHours(provider);

  const day = sgtDayKey(date);
  const window = hours[day];
  if (!window || !window.start || !window.end) return [];

  const start = sgtDate(date, window.start);
  const end = sgtDate(date, window.end);
  if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start.getTime()) || isNaN(end.getTime())) {
    return [];
  }

  const slots: string[] = [];
  const stepMs = SLOT_STEP_MIN * 60 * 1000;
  const durationMs = durationMin * 60 * 1000;

  for (let t = start.getTime(); t + durationMs <= end.getTime(); t += stepMs) {
    const candidateStart = new Date(t);
    if (isFreeAt(provider, hours, candidateStart, durationMin, existingBookings)) {
      slots.push(sgtTime(candidateStart));
    }
  }

  return slots;
}

router.get('/', async (req, res) => {
  try {
    const service = typeof req.query.service === 'string' ? req.query.service : '';
    const city = typeof req.query.city === 'string' ? req.query.city : '';
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    // The storefront always sends minutes ("15", "90"). parseDurationMinutes
    // would read a bare "15" as 15 *hours* (its <20-is-hours heuristic exists
    // for the catalog's mixed-unit duration strings), so parse the query param
    // as a plain number; only the catalog fallback below needs that heuristic.
    const durationParam = typeof req.query.duration === 'string' ? Number(req.query.duration) : NaN;
    let duration = Number.isFinite(durationParam) && durationParam > 0 ? durationParam : null;

    if (!service || !city || !date) {
      return res.status(400).json({ error: 'service, city and date are required' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }

    if (!duration) {
      const [rows]: any = await pool.query(
        'SELECT duration FROM catalog_services WHERE LOWER(name) = LOWER(?) LIMIT 1',
        [service]
      );
      duration = parseDurationMinutes(rows?.[0]?.duration) || 60;
    }

    const [providers]: any = await pool.query(
      `SELECT sp.id, sp.vendor_id, sp.working_hours, sp.services
       FROM service_providers sp
       LEFT JOIN vendors v ON v.id = sp.vendor_id
       WHERE LOWER(sp.city) = LOWER(?) AND sp.status = 'active'
         AND (sp.vendor_id IS NULL OR v.status = 'active')`,
      [city]
    );

    // Provider skill tags are catalog names at any level: exact service
    // names (marketplace pool), subcategory names or whole category names
    // (vendor Partner OS members) — match on all so a member tagged "Makeup"
    // can serve "Party Makeup" and one tagged "Wellness @ Home" covers
    // "Body Massage 60 min".
    const skillTags = await skillTagsForService(service);
    const approved = new Map<number, boolean>();
    const matched: any[] = [];
    for (const p of providers) {
      if (!providerSupportsServices(p, [skillTags])) continue;
      if (p.vendor_id && !approved.has(Number(p.vendor_id))) {
        try {
          await approvedVendorQuote(Number(p.vendor_id), [{ name: service, qty: 1 }]);
          approved.set(Number(p.vendor_id), true);
        } catch (error) {
          if (!(error instanceof VendorPricingError)) throw error;
          approved.set(Number(p.vendor_id), false);
        }
      }
      if (!p.vendor_id || approved.get(Number(p.vendor_id))) matched.push(p);
    }

    if (matched.length === 0) {
      return res.status(200).json({ slots: [] });
    }

    const bookings = await loadProviderSchedule(matched.map((p: any) => p.id), [date]);

    const slotSet = new Set<string>();
    for (const p of matched) {
      for (const slot of providerSlots(p, date, duration, bookings)) {
        slotSet.add(slot);
      }
    }

    const slots = Array.from(slotSet).sort();
    return res.status(200).json({ slots, duration });
  } catch (error) {
    console.error('[GET /api/availability]', error);
    return res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

export default router;
