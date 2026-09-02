import { Router } from 'express';
import pool from '../lib/mysql';
import { parseSgt } from '../lib/sgt';

const router = Router();

const DEFAULT_WORKING_HOURS = {
  mon: { start: '09:00', end: '18:00' },
  tue: { start: '09:00', end: '18:00' },
  wed: { start: '09:00', end: '18:00' },
  thu: { start: '09:00', end: '18:00' },
  fri: { start: '09:00', end: '18:00' },
  sat: { start: '09:00', end: '18:00' },
  sun: { start: '09:00', end: '18:00' },
};

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SLOT_STEP_MIN = 30;

function parseDurationMinutes(str: unknown): number | null {
  if (!str) return null;
  const s = String(str).toLowerCase();
  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|hrs|h)/);
  if (hourMatch) return Math.round(parseFloat(hourMatch[1]) * 60);
  const minMatch = s.match(/(\d+)\s*(?:min|mins|minute|minutes|m)/);
  if (minMatch) return parseInt(minMatch[1], 10);
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  if (Number.isFinite(n)) {
    return n < 20 ? Math.round(n * 60) : Math.round(n);
  }
  return null;
}

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
  const raw = provider.working_hours;
  let hours: any = DEFAULT_WORKING_HOURS;
  try {
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') hours = parsed;
    }
  } catch { /* empty */ }

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
    const candidateEnd = new Date(t + durationMs);

    const busy = existingBookings.some((b) => {
      if (!b.scheduled_at) return false;
      const existingStart = parseSgt(b.scheduled_at);
      if (!existingStart) return false;
      let existingDuration = durationMin;
      try {
        const items = typeof b.items === 'string' ? JSON.parse(b.items) : b.items;
        if (Array.isArray(items)) {
          const total = items.reduce((sum, it) => sum + (parseDurationMinutes(it.duration) || 60), 0);
          if (total > 0) existingDuration = total;
        }
      } catch { /* empty */ }
      const existingEnd = new Date(existingStart.getTime() + existingDuration * 60 * 1000);
      return candidateStart < existingEnd && candidateEnd > existingStart;
    });

    if (!busy) {
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
    let duration = typeof req.query.duration === 'string' ? parseDurationMinutes(req.query.duration) : null;

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
      `SELECT id, working_hours, services
       FROM service_providers
       WHERE LOWER(city) = LOWER(?) AND status = 'active'`,
      [city]
    );

    const serviceLower = service.toLowerCase();
    const matched = providers.filter((p: any) => {
      try {
        const list = typeof p.services === 'string' ? JSON.parse(p.services) : p.services;
        return Array.isArray(list) && list.some((s: string) => String(s).toLowerCase() === serviceLower);
      } catch {
        return false;
      }
    });

    if (matched.length === 0) {
      return res.status(200).json({ slots: [] });
    }

    const providerIds = matched.map((p: any) => p.id);
    const placeholders = providerIds.map(() => '?').join(',');
    const [bookings]: any = await pool.query(
      `SELECT provider_id, scheduled_at, items
       FROM bookings
       WHERE provider_id IN (${placeholders}) AND status != 'cancelled' AND DATE(scheduled_at) = ?`,
      [...providerIds, date]
    );

    const slotSet = new Set<string>();
    for (const p of matched) {
      for (const slot of providerSlots(p, date, duration, bookings.filter((b: any) => b.provider_id === p.id))) {
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
