import { randomUUID } from 'crypto';
import { normalizePhoneToE164 } from './phone';

const ISO_DATETIME_WITH_ZONE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;

export type BookingContact = {
  name: string;
  phone: string;
  address: string;
  city: string;
  area: string;
  pincode: string;
};

export function normalizeBookingContact(value: unknown): BookingContact | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const contact = value as Record<string, unknown>;
  const name = typeof contact.name === 'string' ? contact.name.trim() : '';
  const phone = normalizePhoneToE164(contact.phone);
  const address = typeof contact.address === 'string' ? contact.address.trim() : '';
  const city = typeof contact.city === 'string' ? contact.city.trim() : '';
  const area = typeof contact.area === 'string' ? contact.area.trim() : '';
  const pincode = typeof contact.pincode === 'string' ? contact.pincode.trim() : '';

  if (
    !name || !phone || !address || !city || !area
    || name.length > 255 || address.length > 5000 || city.length > 100 || area.length > 100
    || !/^\d{6}$/.test(pincode)
  ) {
    return null;
  }

  return { name, phone, address, city, area, pincode };
}

export function parseIsoDateTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATETIME_WITH_ZONE.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0'] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));

  if (
    year < 1000 || month < 1 || month > 12 || day < 1
    || calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day
    || hour > 23 || minute > 59 || second > 59
  ) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function newBookingReference(): string {
  return `KYND-${randomUUID().replace(/-/g, '').toUpperCase()}`;
}
