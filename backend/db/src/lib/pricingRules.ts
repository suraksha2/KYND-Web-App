import pool from './mysql';

const DEFAULT_MARKUP_PCT = 30;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function safeJson(value: unknown, fallback: unknown = null) {
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

export function computePartnerCostFromRule(
  rule: { strategy: string; params: any },
  opts: { durationHours: number; partySize: number; startTime: string }
): number | null {
  const { strategy, params } = rule;
  const { durationHours, partySize, startTime } = opts;

  switch (strategy) {
    case 'hourly': {
      const rate = resolveHourlyRate(params, startTime) ?? 0;
      return roundMoney(rate * durationHours);
    }
    case 'per_unit': {
      const rate = Number(params?.rate ?? 0);
      return roundMoney(rate * partySize);
    }
    case 'flat': {
      return roundMoney(Number(params?.amount ?? 0));
    }
    case 'tiered': {
      const tiers = Array.isArray(params?.tiers) ? params.tiers : [];
      const sorted = [...tiers]
        .filter((t: any) => typeof t.up_to === 'number' && !Number.isNaN(t.up_to))
        .sort((a: any, b: any) => a.up_to - b.up_to);
      const tier = sorted.find((t: any) => partySize <= t.up_to) || sorted[sorted.length - 1];
      if (tier && typeof tier.amount === 'number') return roundMoney(tier.amount);
      return null;
    }
    case 'custom_quote':
      return null;
    default:
      return null;
  }
}

export function markupPct(override: number | null | undefined) {
  return (override ?? DEFAULT_MARKUP_PCT) / 100;
}

export function parseDurationHours(duration: unknown): number {
  if (!duration) return 1;
  const s = String(duration).toLowerCase();
  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|hrs|h)/);
  if (hourMatch) return Math.max(0.25, parseFloat(hourMatch[1]));
  const minMatch = s.match(/(\d+)\s*(?:min|mins|minute|minutes|m)/);
  if (minMatch) return Math.max(0.25, parseInt(minMatch[1], 10) / 60);
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  if (Number.isFinite(n)) return n < 20 ? Math.max(0.25, n) : Math.max(0.25, n / 60);
  return 1;
}

export function startTimeFromScheduledAt(scheduledAt: string | null | undefined): string {
  if (!scheduledAt) return '09:00';
  const m = String(scheduledAt).match(/T(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  return '09:00';
}

export async function loadPricingRulesByServiceIds(
  serviceIds: number[]
): Promise<Map<number, { strategy: string; params: any }>> {
  if (!serviceIds.length) return new Map();
  const placeholders = serviceIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT service_id, strategy, params
     FROM service_pricing_rules
     WHERE service_id IN (${placeholders})
     ORDER BY id`,
    serviceIds
  );
  const map = new Map<number, { strategy: string; params: any }>();
  for (const r of rows as any[]) {
    const id = Number(r.service_id);
    if (!map.has(id)) {
      map.set(id, { strategy: r.strategy, params: safeJson(r.params, {}) });
    }
  }
  return map;
}
