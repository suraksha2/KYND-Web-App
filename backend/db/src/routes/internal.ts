import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
// Later multi-vendor stage (expire-offers): import pool from '../lib/mysql';
import { findDueOccurrences, markNotified, topUpOccurrences } from '../lib/occurrences';
import { findMissedBookings, findMissedOccurrences, markMissedNotified } from '../lib/missed';
import { sendProviderAssignmentWhatsApp, sendMissedJobsWhatsApp } from '../lib/whatsapp';
import { runVendorPayoutBatch } from '../lib/payouts';

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

  // Second pass: jobs whose slot has already passed without being marked done.
  // The admin gets one consolidated WhatsApp; `missed_notified_at` makes it
  // fire once per job. Skipped entirely when ADMIN_WHATSAPP_NUMBER is unset so
  // the flags are left clear and the alert sends once a number is configured.
  const missedGraceMinutes = Math.min(
    Math.max(Number(req.body?.missedGraceMinutes) || 60, 5),
    7 * 24 * 60
  );
  const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
  let missedAlerted = 0;

  if (adminPhone) {
    const missed = [
      ...(await findMissedOccurrences(missedGraceMinutes)),
      ...(await findMissedBookings(missedGraceMinutes)),
    ];

    if (missed.length) {
      const result = await sendMissedJobsWhatsApp(
        adminPhone,
        missed.map((m) => ({
          bookingId: m.booking_ref,
          serviceName: serviceNameOf(m.service_items),
          visitSeq: m.seq,
          dueAt: m.due_at,
          minsLate: m.mins_late,
          providerName: m.provider_name,
          contactName: m.contact_name,
          contactArea: m.contact_area,
          contactCity: m.contact_city,
        }))
      );

      if (result.success) {
        for (const job of missed) {
          await markMissedNotified(job);
        }
        missedAlerted = missed.length;
      } else {
        console.error('[POST /api/internal/dispatch-due] missed-job alert failed:', result.error);
      }
    }
  }

  return res.status(200).json({
    due: due.length,
    notified,
    failed: failures.length,
    occurrencesAdded: added,
    missedAlerted,
  });
});

/**
 * Weekly vendor payout generation — the same batch the superadmin's
 * "Run payout batch" button triggers (src/lib/payouts.ts). Idempotent: it
 * only picks up un-batched completed Kynd jobs, so running it more often
 * than weekly just keeps the current week's 'scheduled' accrual fresh.
 * Suggested schedule: Monday mornings, after the week has closed.
 *
 *   0 8 * * 1 curl -fsS -X POST http://127.0.0.1:3001/api/internal/run-payouts \
 *     -H "Authorization: Bearer $INTERNAL_API_TOKEN" >> /var/log/kynd-payouts.log 2>&1
 *
 * Generating rows never moves money — an admin still disburses and marks
 * each 'pending' payout paid in the superadmin console.
 */
router.post('/run-payouts', async (req, res) => {
  if (!isAuthorizedCaller(req.headers.authorization)) {
    return res.status(401).json({ error: 'Invalid internal token.' });
  }

  try {
    const result = await runVendorPayoutBatch();
    return res.status(200).json(result);
  } catch (error: any) {
    if (error?.status === 409) return res.status(409).json({ error: error.message });
    console.error('[POST /api/internal/run-payouts]', error);
    return res.status(500).json({ error: 'Failed to run the payout batch.' });
  }
});

/**
 * Sweeps vendor offers whose `expires_at` has passed from 'open' to
 * 'expired'. `GET /vendor/offers` and `/vendor/home` already reclassify an
 * overdue offer on read, so nothing is customer-facing broken without this —
 * it just keeps the stored status (and anything else that queries `offers`
 * directly) honest. Suggested schedule: every minute, same
 * INTERNAL_API_TOKEN pattern as dispatch-due.
 *
 *   * * * * * curl -fsS -X POST http://127.0.0.1:3001/api/internal/expire-offers \
 *     -H "Authorization: Bearer $INTERNAL_API_TOKEN" >> /var/log/kynd-offers.log 2>&1
 */
/* Offer inbox deferred until the multi-vendor stage.
router.post('/expire-offers', async (req, res) => {
  if (!isAuthorizedCaller(req.headers.authorization)) {
    return res.status(401).json({ error: 'Invalid internal token.' });
  }

  try {
    const [result]: any = await pool.query(
      `UPDATE offers SET status = 'expired' WHERE status = 'open' AND expires_at < NOW()`
    );
    return res.status(200).json({ expired: result.affectedRows || 0 });
  } catch (error) {
    console.error('[POST /api/internal/expire-offers]', error);
    return res.status(500).json({ error: 'Failed to expire offers.' });
  }
});
*/

export default router;
