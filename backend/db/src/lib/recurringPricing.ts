type RecurrenceInput = {
  type?: unknown;
  value?: unknown;
  plan?: unknown;
  days?: unknown;
};

type ServicePricingContext = {
  name?: string;
  category_name?: string;
  booking_behavior?: string | null;
  office_pricing?: unknown;
};

const DEFAULT_OFFICE_SIZES = [
  { id: '1-2k', threeWeek: 450, daily: 550 },
  { id: '2-3k', threeWeek: 650, daily: 750 },
  { id: '3-4k', threeWeek: 850, daily: 1100 },
  { id: '4-5k', threeWeek: null, daily: 1250 },
  { id: '5-7k', threeWeek: null, daily: 1520 },
  { id: '7k+', threeWeek: null, daily: null },
];

function parseJson(value: unknown): any {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function weekdays(recurrence: RecurrenceInput, scheduledAt?: string | null): number[] {
  const days = Array.isArray(recurrence.days)
    ? recurrence.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  const date = String(scheduledAt || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (date) {
    days.push(new Date(Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]))).getUTCDay());
  }
  return [...new Set(days)];
}

function houseDiscount(plan: string, dayCount: number): number {
  if (plan === 'biweekly') return dayCount ? 0.10 : 0;
  if (plan === 'weekdays') {
    if (dayCount >= 5) return 0.25;
    if (dayCount >= 2) return 0.20;
    return dayCount ? 0.15 : 0;
  }
  if (plan === 'daily') {
    if (dayCount >= 7) return 0.30;
    if (dayCount >= 5) return 0.25;
    if (dayCount >= 2) return 0.20;
    return dayCount ? 0.15 : 0;
  }
  if (plan === 'weekly') {
    if (dayCount >= 2) return 0.20;
    return dayCount ? 0.15 : 0;
  }
  return 0.15;
}

export function recurringDiscountPct(
  services: ServicePricingContext[],
  recurrenceValue: unknown,
  scheduledAt?: string | null
): number {
  const recurrence = (parseJson(recurrenceValue) || {}) as RecurrenceInput;
  if (recurrence.type !== 'preset') return 0.15;

  const wellnessService = services.length > 0 && services.every((service) =>
    service.booking_behavior === 'wellness_session'
    || /wellness/i.test(String(service.category_name || ''))
  );
  if (wellnessService) {
    if (recurrence.value === 'fourweekly') return 0.05;
    if (recurrence.value === 'biweekly') return 0.10;
    if (recurrence.value === 'weekly') return 0.15;
  }

  const houseService = services.length > 0 && services.every((service) =>
    /cleaning/i.test(String(service.category_name || ''))
    && (service.booking_behavior === 'house_cleaning'
      || /^one-time cleaning\b/i.test(String(service.name || '')))
  );
  const plan = typeof recurrence.plan === 'string' ? recurrence.plan : '';
  if (houseService && ['weekly', 'biweekly', 'weekdays', 'daily'].includes(plan)) {
    const allowedDays = plan === 'weekdays' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
    const maxDays = plan === 'weekly' || plan === 'biweekly' ? 4 : plan === 'weekdays' ? 5 : 7;
    const selected = weekdays(recurrence, scheduledAt).filter((day) => allowedDays.includes(day));
    const count = Math.min(maxDays, selected.length || (plan === 'weekdays' ? 5 : plan === 'daily' ? 7 : 1));
    return houseDiscount(plan, count);
  }

  return 0.15;
}

export function officeRecurringVisitTotal(
  service: ServicePricingContext,
  item: { officeSize?: unknown; qty?: unknown },
  recurrenceValue: unknown,
  scheduledAt?: string | null
): number | null {
  const recurrence = (parseJson(recurrenceValue) || {}) as RecurrenceInput;
  const plan = recurrence.plan;
  if (plan !== 'threeWeek' && plan !== 'daily') return null;

  const configured = parseJson(service.office_pricing);
  const sizes = Array.isArray(configured?.sizes) && configured.sizes.length
    ? configured.sizes
    : DEFAULT_OFFICE_SIZES;
  const size = sizes.find((row: any) => String(row?.id) === String(item.officeSize));
  const monthly = Number(size?.[plan]);
  if (!Number.isFinite(monthly) || monthly <= 0) return null;

  const allowed = [1, 2, 3, 4, 5];
  const selected = weekdays(recurrence, scheduledAt).filter((day) => allowed.includes(day));
  const defaultDays = plan === 'threeWeek' ? 3 : 5;
  const maxDays = defaultDays;
  const dayCount = Math.min(maxDays, selected.length || defaultDays);
  const visitsPerMonth = dayCount * 52 / 12;
  const cleaners = Math.max(1, Math.min(20, Number(item.qty) || 1));
  return Math.round(monthly * cleaners / visitsPerMonth);
}
