const BOOKING_STATUSES = new Set(['upcoming', 'completed', 'cancelled']);
const TRANSITIONS: Record<string, Set<string>> = {
  upcoming: new Set(['completed', 'cancelled']),
  completed: new Set(),
  cancelled: new Set(),
};

export function isBookingStatus(value: unknown): value is 'upcoming' | 'completed' | 'cancelled' {
  return typeof value === 'string' && BOOKING_STATUSES.has(value);
}

export function isAllowedBookingStatusTransition(from: unknown, to: unknown): boolean {
  if (!isBookingStatus(from) || !isBookingStatus(to)) return false;
  return from === to || TRANSITIONS[from].has(to);
}
