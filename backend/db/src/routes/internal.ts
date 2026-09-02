import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { findDueOccurrences, markNotified, topUpOccurrences } from '../lib/occurrences';
import { sendProviderAssignmentWhatsApp } from '../lib/whatsapp';

const router = Router();

// Machine-to-machine endpoints. There is no session here — a cron job calls
// them — so they are gated on a shared secret instead. Without the secret
// configured the routes stay closed rather than open.
function isAuthorizedCaller(header: string | undefined): boolean {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected || expected.length < 16) return false;
  const provided = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function serviceNameOf(items: unknown): string {
  try {
    const list = typeof items === 'string' ? JSON.parse(items) : items;
    if (Array.isArray(list) && list.length) {
      return list.map((it: any) => it.name || it.serviceName || it.title || 'Service').join(', ');
    }
  } catch { /* empty */ }
  return 'Service';
}

/**
 * Notify the assigned partner about every visit starting soon, then keep each
 * series topped up. Idempotent: `notified_at` means a retried or overlapping
 * cron run will not message twice.
 */
router.post('/dispatch-due', async (req, res) => {
  if (!isAuthorizedCaller(req.headers.authorization)) {
    return res.status(401).json({ error: 'Invalid internal token.' });
  }

  const withinHours = Math.min(Math.max(Number(req.body?.withinHours) || 24, 1), 168);
  const due = await findDueOccurrences(withinHours);

  let notified = 0;
  const failures: { occurrenceId: number; error: string }[] = [];
  const touchedBookings = new Set<number>();

  for (const o of due) {
    if (!o.provider_mobile) continue;
    const result = await sendProviderAssignmentWhatsApp(o.provider_mobile, o.provider_name || 'Partner', {
      bookingId: o.booking_ref,
      serviceName: serviceNameOf(o.items),
      scheduledAt: o.scheduled_at,
      schedule: o.schedule,
      cadence: o.cadence,
      visitSeq: o.seq,
      contactName: o.contact_name,
      contactPhone: o.contact_phone,
      contactAddress: o.contact_address,
      contactArea: o.contact_area,
      contactCity: o.contact_city,
      contactPincode: o.contact_pincode,
      notes: o.notes,
      total: o.total,
      payment: o.payment,
    });

    // Only mark on success, so a WhatsApp outage retries on the next run
    // instead of silently swallowing the visit.
    if (result.success) {
      await markNotified(o.id);
      notified++;
      touchedBookings.add(o.booking_id);
    } else {
      failures.push({ occurrenceId: o.id, error: result.error || 'send failed' });
    }
  }

  let added = 0;
  for (const bookingDbId of touchedBookings) {
    added += await topUpOccurrences(bookingDbId);
  }

  if (failures.length) {
    console.error('[POST /api/internal/dispatch-due] failures:', failures);
  }

  return res.status(200).json({
    due: due.length,
    notified,
    failed: failures.length,
    occurrencesAdded: added,
  });
});

export default router;
