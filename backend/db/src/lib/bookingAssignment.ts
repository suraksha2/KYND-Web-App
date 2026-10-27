import type { Request, Response } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import pool from './mysql';
import { hasAdminAccess, canManageVendorTeam, type SessionPayload } from './auth';
import { getSession } from '../http/session';
import { providerSupportsServices, skillTagsForService } from './providerSkills';
import { bookingDurationMinutes, loadProviderSchedule, isFreeAt, providerWorkingHours } from './providerSchedule';
import { parseSgt, sgtDateTime } from './sgt';
import { sendProviderAssignmentWhatsApp } from './whatsapp';
import { approvedVendorQuote, assignVendorFinancials, VendorPricingError } from './vendorFinance';

export class AssignmentError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function positiveId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AssignmentError(400, 'Invalid assignment ID.');
  return id;
}

function array(value: any): any[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// Called in a transaction. Lock the roster before reading schedules, just as
// automatic matching does, then lock the booking to recheck ownership/status.
export async function assignmentContext(
  db: PoolConnection, bookingId: number, occurrenceId: number | null,
  session: SessionPayload, lock = false
) {
  const admin = hasAdminAccess(session.role);
  if (!admin && (!canManageVendorTeam(session.role) || !session.vendorId)) {
    throw new AssignmentError(403, 'Only admins and vendor owners or managers can reassign bookings.');
  }
  const [roster]: any = await db.query(
    `SELECT sp.*, v.name AS vendor_name, v.status AS vendor_status
       FROM service_providers sp LEFT JOIN vendors v ON v.id = sp.vendor_id
      ORDER BY sp.id ${lock ? 'FOR UPDATE' : ''}`
  );
  const [rows]: any = await db.query(
    `SELECT * FROM bookings WHERE id = ? ${lock ? 'FOR UPDATE' : ''}`, [bookingId]
  );
  const booking = rows[0];
  if (!booking) throw new AssignmentError(404, 'Booking not found.');
  const [occurrences]: any = await db.query(
    `SELECT * FROM booking_occurrences WHERE booking_id = ? ORDER BY seq ${lock ? 'FOR UPDATE' : ''}`,
    [bookingId]
  );
  const visits = occurrenceId
    ? occurrences.filter((o: any) => Number(o.id) === occurrenceId)
    : booking.schedule === 'recurring'
      ? occurrences.filter((o: any) => o.status === 'upcoming')
      : [{ id: null, provider_id: booking.provider_id, status: booking.status, scheduled_at: booking.scheduled_at }];
  if (!visits.length) throw new AssignmentError(409, 'There are no open visits to reassign.');
  const currentProviders = visits.map((v: any) => v.provider_id ?? booking.provider_id);
  const owns = (id: any) => roster.some((p: any) =>
    Number(p.id) === Number(id) && Number(p.vendor_id) === Number(session.vendorId));
  // A vendor may cover its own visits, but cannot take another vendor's work
  // or change the future series owner after an admin has transferred it.
  if (!admin && (!currentProviders.every(owns) || (!occurrenceId && !owns(booking.provider_id)))) {
    throw new AssignmentError(404, 'Booking not found on your team.');
  }
  if (booking.status !== 'upcoming' || visits.some((v: any) => v.status !== 'upcoming')) {
    throw new AssignmentError(409, 'Completed or cancelled work cannot be reassigned.');
  }
  const [jobs]: any = await db.query('SELECT id FROM jobs WHERE booking_id = ? LIMIT 1', [bookingId]);
  if (booking.vendor_id || booking.vendor_job_id || jobs.length) {
    throw new AssignmentError(409, 'This booking is managed as a vendor job. Reassign it from the vendor Jobs page.');
  }
  const items = array(booking.items).filter((item: any) => !item.addonId && !item.addonServiceId);
  const tags = await Promise.all(items.map((item: any) => skillTagsForService(item.name || item.serviceName, db)));
  const candidates = roster.filter((p: any) =>
    p.status === 'active' && (!p.vendor_id || p.vendor_status === 'active') &&
    String(p.city).toLowerCase() === String(booking.contact_city).toLowerCase() &&
    (admin || Number(p.vendor_id) === Number(session.vendorId)) &&
    providerSupportsServices(p, tags));
  const dates = visits.map((v: any) => String(v.scheduled_at).slice(0, 10));
  const busy = await loadProviderSchedule(
    candidates.map((p: any) => p.id), dates, db, occurrenceId ?? -1, occurrenceId ? -1 : bookingId
  );
  const duration = bookingDurationMinutes(items);
  const rateErrors = new Map<number, string>();
  for (const p of candidates) {
    if (!p.vendor_id || rateErrors.has(Number(p.vendor_id))) continue;
    // Existing same-vendor commitments keep their saved approved rate.
    const keys = [...visits.map((v: any) => Number(v.id) || 0), ...(!occurrenceId ? [0] : [])];
    const [saved]: any = await db.query(
      `SELECT occurrence_key FROM vendor_booking_financials WHERE booking_id = ? AND vendor_id = ?
        AND occurrence_key IN (?)`, [bookingId, p.vendor_id, keys]
    );
    if (new Set(saved.map((r: any) => Number(r.occurrence_key))).size === new Set(keys).size) {
      rateErrors.set(Number(p.vendor_id), '');
      continue;
    }
    try {
      await approvedVendorQuote(Number(p.vendor_id), booking.items, db, lock);
      rateErrors.set(Number(p.vendor_id), '');
    } catch (error) {
      if (!(error instanceof VendorPricingError)) throw error;
      rateErrors.set(Number(p.vendor_id), error.message);
    }
  }
  const providers = candidates.map((p: any) => {
    const pricingError = rateErrors.get(Number(p.vendor_id)) || '';
    const available = !pricingError && visits.every((v: any) => {
      const at = parseSgt(v.scheduled_at);
      return at && isFreeAt(p, providerWorkingHours(p), at, duration, busy);
    });
    return {
      id: p.id, name: p.name, vendorName: p.vendor_name || 'Independent provider',
      available, current: currentProviders.every((id: any) => Number(id) === Number(p.id)),
      reason: pricingError || (available ? '' : 'On leave, outside working hours or already booked for a visit.'),
    };
  });
  return { booking, visits, providers, roster };
}

export async function saveAssignment(
  db: PoolConnection, bookingId: number, occurrenceId: number | null,
  providerId: number, reason: string, session: SessionPayload
) {
  const context = await assignmentContext(db, bookingId, occurrenceId, session, true);
  const { booking, visits, providers, roster } = context;
  const provider = providers.find((p: any) => Number(p.id) === providerId);
  if (!provider) throw new AssignmentError(400, 'Choose an active, qualified provider in the booking city.');
  if (provider.current && (occurrenceId || Number(booking.provider_id) === providerId)) {
    const vendorId = roster.find((p: any) => Number(p.id) === providerId)?.vendor_id ?? null;
    if (!occurrenceId) await assignVendorFinancials(db, booking, vendorId);
    for (const visit of visits) {
      if (visit.id) await assignVendorFinancials(db, booking, vendorId, Number(visit.id));
    }
    return { ...context, unchanged: true, provider: roster.find((p: any) => Number(p.id) === providerId) };
  }
  if (!provider.available) throw new AssignmentError(409, provider.reason || 'That provider is no longer available for every selected visit.');
  const vendorId = roster.find((p: any) => Number(p.id) === providerId)?.vendor_id ?? null;
  if (!occurrenceId) await assignVendorFinancials(db, booking, vendorId);
  for (const visit of visits) {
    if (visit.id) await assignVendorFinancials(db, booking, vendorId, Number(visit.id));
  }
  const at = sgtDateTime(new Date());
  const history = array(booking.history);
  history.push({
    at, type: 'provider_reassigned',
    note: `${occurrenceId ? `Visit #${visits[0].seq}` : 'All remaining visits'} assigned to ${provider.name}: ${reason}`,
    actorId: session.id, actorRole: session.role, vendorId: session.vendorId ?? null,
    occurrenceId, previousProviderId: booking.provider_id, providerId, reason,
    visits: visits.map((v: any) => ({ id: v.id, previousProviderId: v.provider_id ?? booking.provider_id })),
  });
  await db.query('UPDATE bookings SET history = ? WHERE id = ?', [JSON.stringify(history), bookingId]);
  if (!occurrenceId) {
    await db.query('UPDATE bookings SET provider_id = ?, assigned_at = ?, missed_notified_at = NULL WHERE id = ?',
      [providerId, at, bookingId]);
  }
  for (const visit of visits) {
    if (visit.id && Number(visit.provider_id) !== providerId) {
      await db.query(
        'UPDATE booking_occurrences SET provider_id = ?, notified_at = NULL, missed_notified_at = NULL WHERE id = ?',
        [providerId, visit.id]
      );
    }
  }
  if (!booking.provider_id && !occurrenceId) {
    await db.query('UPDATE service_providers SET total_jobs = total_jobs + 1 WHERE id = ?', [providerId]);
  }
  return { ...context, unchanged: false, provider: roster.find((p: any) => Number(p.id) === providerId) };
}

// Shared by the admin booking routes and the vendor-scoped booking routes.
export async function handleBookingAssignment(req: Request, res: Response) {
  let db: PoolConnection | undefined;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Authentication required.' });
    const bookingId = positiveId(req.params.id);
    const rawOccurrence = req.method === 'GET' ? req.query.occurrenceId : req.body?.occurrenceId;
    const occurrenceId = rawOccurrence == null || rawOccurrence === '' ? null : positiveId(rawOccurrence);
    const writing = req.method !== 'GET';
    const providerId = writing ? positiveId(req.body?.provider_id) : 0;
    const reason = String(req.body?.reason || '').trim();
    if (writing && (!reason || reason.length > 500)) {
      throw new AssignmentError(400, 'Enter a reassignment reason (up to 500 characters).');
    }
    db = await pool.getConnection();
    await db.beginTransaction();
    if (!writing) {
      const context = await assignmentContext(db, bookingId, occurrenceId, session);
      await db.commit();
      return res.json({ providers: context.providers, visits: context.visits.map((v: any) => ({
        id: v.id, seq: v.seq, scheduledAt: v.scheduled_at, providerId: v.provider_id,
      })) });
    }
    const result = await saveAssignment(db, bookingId, occurrenceId, providerId, reason, session);
    await db.commit();
    db.release();
    db = undefined;
    if (result.unchanged) return res.json({ success: true, unchanged: true });
    const { booking: b, provider: p, visits } = result;
    // Notify only after commit; a delivery failure must not report the saved
    // reassignment as failed. Recurring dispatch markers were reset above.
    const notification = await sendProviderAssignmentWhatsApp(p.mobile || '', p.name, {
      bookingId: b.booking_id,
      serviceName: array(b.items).map((i: any) => i.name || i.serviceName || 'Service').join(', '),
      scheduledAt: visits[0].scheduled_at, schedule: occurrenceId ? 'scheduled' : b.schedule,
      cadence: occurrenceId ? null : b.cadence, visitSeq: occurrenceId ? visits[0].seq : null,
      contactName: b.contact_name, contactPhone: b.contact_phone, contactAddress: b.contact_address,
      contactArea: b.contact_area, contactCity: b.contact_city, contactPincode: b.contact_pincode,
      notes: b.notes, total: b.total, payment: b.payment,
    }).catch(() => ({ success: false }));
    return res.json({
      success: true,
      warning: notification.success ? null : 'Assignment saved. WhatsApp could not be delivered; please contact the replacement provider.',
    });
  } catch (error) {
    if (db) await db.rollback();
    if (error instanceof AssignmentError || error instanceof VendorPricingError) return res.status(error.status).json({ error: error.message });
    console.error('[booking assignment]', error);
    return res.status(500).json({ error: 'Failed to update assignment. Please try again.' });
  } finally {
    db?.release();
  }
}
