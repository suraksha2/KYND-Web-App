import { Router } from 'express';
import pool from '../lib/mysql';
import { hasAdminAccess } from '../lib/auth';
import { getSession } from '../http/session';
import { withOccurrences, completeNextOccurrence } from '../lib/occurrences';
import { sgtDateTime } from '../lib/sgt';
import type { PoolConnection } from 'mysql2/promise';
import { recordVendorCompletion, VendorPricingError } from '../lib/vendorFinance';

const router = Router();

const ALLOWED_STATUSES = ['upcoming', 'completed', 'cancelled'] as const;

// GET bookings assigned to the authenticated service provider.
router.get('/bookings', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (session.role !== 'provider' && !hasAdminAccess(session.role)) {
      return res.status(403).json({ error: 'Provider access required.' });
    }

    const [rows] = await pool.query(
      `SELECT id, booking_id, items, total, schedule, scheduled_at, cadence,
              contact_name, contact_phone, contact_address, contact_city,
              contact_pincode, contact_area, notes, payment, placed_at, status,
              cancelled_by, cancelled_at, cancel_reason,
              provider_id, assigned_at
       FROM bookings
       WHERE (schedule <> 'recurring' AND provider_id = ?)
          OR (schedule = 'recurring' AND EXISTS (
            SELECT 1 FROM booking_occurrences o WHERE o.booking_id = bookings.id AND o.provider_id = ?
          ))
       ORDER BY
         CASE status WHEN 'upcoming' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
         COALESCE(scheduled_at, placed_at) ASC`,
      [session.id, session.id]
    );

    const data = (await withOccurrences(rows as any[])).map((b: any) => {
      if (b.schedule !== 'recurring') return b;
      const occurrences = b.occurrences.filter((o: any) => Number(o.provider_id) === Number(session.id));
      return {
        ...b, occurrences, canMessage: Number(b.provider_id) === Number(session.id),
        canCancel: Number(b.provider_id) === Number(session.id) &&
          b.occurrences.every((o: any) => o.status !== 'upcoming' || Number(o.provider_id) === Number(session.id)),
        status: b.status === 'cancelled' ? 'cancelled'
          : occurrences.some((o: any) => o.status === 'upcoming') ? 'upcoming'
          : occurrences.some((o: any) => o.status === 'completed') ? 'completed' : 'cancelled',
      };
    });

    // Vendor "external" jobs (source='own') assigned to this worker live in
    // the `jobs` table, not `bookings` — merge them in so the provider console
    // shows all of the worker's work, not just Kynd marketplace bookings.
    // 'kynd'-sourced jobs are excluded: their linked booking already surfaces
    // through the query above. Mapped into the booking-card shape with a
    // `job-<id>` key so PUT /provider/bookings/:id can route updates back.
    const [jobRows]: any = session.role === 'provider' ? await pool.query(
      `SELECT j.id, j.status, j.service_label, j.customer_name, j.customer_phone,
              j.customer_address, j.customer_area, j.notes, j.window_start, j.created_at,
              v.name AS vendor_name
         FROM jobs j
         JOIN vendors v ON v.id = j.vendor_id
        WHERE j.assignee_provider_id = ? AND j.source = 'own'
          AND j.window_start >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        ORDER BY j.window_start
        LIMIT 300`,
      [session.id]
    ) : [[]];
    const VENDOR_JOB_STATUS: Record<string, string> = {
      accepted: 'upcoming', assigned: 'upcoming', in_progress: 'upcoming',
      completed: 'completed', paid: 'completed', cancelled: 'cancelled',
    };
    for (const j of jobRows as any[]) {
      data.push({
        id: `job-${j.id}`,
        booking_id: `JOB-${j.id}`,
        items: [{ name: j.service_label }],
        total: null,
        schedule: 'once',
        scheduled_at: j.window_start,
        placed_at: j.created_at,
        cadence: null,
        contact_name: j.customer_name,
        contact_phone: j.customer_phone,
        contact_address: j.customer_address,
        contact_area: j.customer_area,
        contact_city: null,
        contact_pincode: null,
        notes: j.notes,
        payment: 'External job',
        status: VENDOR_JOB_STATUS[j.status] || 'upcoming',
        cancelled_by: null,
        cancelled_at: null,
        cancel_reason: null,
        provider_id: session.id,
        assigned_at: null,
        vendorJob: true,
        vendorName: j.vendor_name,
        canMessage: false,
        canCancel: false,
      });
    }
    const statusRank = (s: string) => (s === 'upcoming' ? 0 : s === 'completed' ? 1 : 2);
    data.sort((a: any, b: any) =>
      statusRank(a.status) - statusRank(b.status) ||
      String(a.scheduled_at || a.placed_at || '').localeCompare(String(b.scheduled_at || b.placed_at || ''))
    );
    return res.status(200).json({ data });
  } catch (error) {
    console.error('[GET /api/provider/bookings]', error);
    return res.status(500).json({ error: 'Failed to fetch assigned bookings' });
  }
});

// PUT update the status of a booking assigned to the authenticated provider.
router.put('/bookings/:id', async (req, res) => {
  let db: PoolConnection | undefined;
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const isProvider = session.role === 'provider';
    if (!isProvider && !hasAdminAccess(session.role)) {
      return res.status(403).json({ error: 'Provider access required.' });
    }

    const body = req.body;
    const { status } = body;

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'A valid status is required.' });
    }

    // Vendor external jobs surface here as `job-<id>` (see GET above). They
    // live in the `jobs` table with their own status machine, so completion
    // jumps accepted/assigned straight to completed — matching PATCH
    // /vendor/jobs/:id/status minus the desk-seat-only actions. Workers can
    // complete their own vendor jobs but never cancel or reopen them.
    const jobIdMatch = /^job-(\d+)$/.exec(String(req.params.id));
    if (jobIdMatch) {
      if (!isProvider) {
        return res.status(403).json({ error: 'Provider access required.' });
      }
      const [jobRows]: any = await pool.query(
        "SELECT id, status, assignee_provider_id FROM jobs WHERE id = ? AND source = 'own'",
        [jobIdMatch[1]]
      );
      const job = (jobRows as any[])[0];
      if (!job || Number(job.assignee_provider_id) !== Number(session.id)) {
        return res.status(404).json({ error: 'Job not found.' });
      }
      if (status === 'cancelled') {
        return res.status(403).json({ error: 'Only your vendor can cancel this job.' });
      }
      if (status !== 'completed') {
        return res.status(400).json({ error: 'This job cannot be reopened.' });
      }
      if (!['accepted', 'assigned', 'in_progress'].includes(job.status)) {
        return res.status(409).json({ error: 'This job is already closed.' });
      }
      await pool.query(
        "UPDATE jobs SET status = 'completed', started_at = COALESCE(started_at, NOW()), completed_at = NOW() WHERE id = ?",
        [job.id]
      );
      return res.status(200).json({ success: true, status });
    }

    // Ensure the booking exists and (for providers) belongs to this provider.
    const [rows]: any = await pool.query(
      'SELECT id, provider_id, schedule, history FROM bookings WHERE id = ?',
      [req.params.id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    const booking = rows[0];
    const completingVisit = booking.schedule === 'recurring' && status === 'completed';
    if (isProvider && !completingVisit && Number(booking.provider_id) !== Number(session.id)) {
      return res.status(403).json({ error: 'This task is not assigned to you.' });
    }
    if (isProvider && booking.schedule === 'recurring' && !completingVisit) {
      const [others]: any = await pool.query(
        "SELECT id FROM booking_occurrences WHERE booking_id = ? AND status = 'upcoming' AND (provider_id IS NULL OR provider_id != ?) LIMIT 1",
        [booking.id, session.id]
      );
      if (others.length) return res.status(403).json({ error: 'Contact admin to change a series shared with another provider.' });
    }

    // Append an entry to the history JSON audit trail.
    let history: any[] = [];
    try {
      history = typeof booking.history === 'string'
        ? JSON.parse(booking.history)
        : (booking.history || []);
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }
    const now = sgtDateTime(new Date());
    const actor = isProvider ? 'provider' : 'admin';
    const isRecurring = booking.schedule === 'recurring';

    // Recurring bookings are completed one visit at a time; close the next
    // upcoming occurrence and top the series up so future visits stay visible.
    if (status === 'completed' && isRecurring) {
      const completed = await completeNextOccurrence(Number(req.params.id), isProvider ? Number(session.id) : undefined);
      if (!completed) {
        return res.status(409).json({ error: 'No upcoming visit to complete.' });
      }

      history.push({
        at: now,
        type: 'completed',
        by: actor,
        note: `Marked visit #${completed.seq} completed by ${session.role}`,
      });

      // Append atomically so a concurrent reassignment's audit is retained.
      await pool.query(
        "UPDATE bookings SET history = JSON_ARRAY_APPEND(COALESCE(history, JSON_ARRAY()), '$', JSON_EXTRACT(?, '$')) WHERE id = ?",
        [JSON.stringify(history[history.length - 1]), req.params.id]
      );

      return res.status(200).json({ success: true, status, completedOccurrence: completed });
    }

    history.push({
      at: now,
      type: status === 'cancelled' ? 'cancelled' : 'status',
      by: actor,
      note: `Marked ${status} by ${session.role}`,
    });

    // A worker may have this card open while an admin replaces them. Recheck
    // ownership in the write itself and retain concurrent assignment history.
    const ownershipClause = isProvider ? `AND provider_id = ?
      AND NOT EXISTS (SELECT 1 FROM booking_occurrences o
        WHERE o.booking_id = bookings.id AND o.status = 'upcoming'
          AND (o.provider_id IS NULL OR o.provider_id != ?))` : '';
    const ownershipParams = isProvider ? [session.id, session.id] : [];
    const entry = JSON.stringify(history[history.length - 1]);
    db = await pool.getConnection();
    await db.beginTransaction();
    await db.query('SELECT id FROM bookings WHERE id = ? FOR UPDATE', [req.params.id]);
    if (booking.schedule !== 'recurring') {
      await recordVendorCompletion(db, Number(req.params.id), 0, status === 'completed');
    }
    let updated: any;
    if (status === 'cancelled') {
      [updated] = await db.query(
        `UPDATE bookings
            SET status = ?, cancelled_by = ?, cancelled_at = ?,
                history = JSON_ARRAY_APPEND(COALESCE(history, JSON_ARRAY()), '$', JSON_EXTRACT(?, '$'))
          WHERE id = ? ${ownershipClause}`,
        [status, actor, now, entry, req.params.id, ...ownershipParams]
      );
    } else {
      // Re-opening or completing clears any stale cancellation metadata.
      [updated] = await db.query(
        `UPDATE bookings
            SET status = ?, cancelled_by = NULL, cancelled_at = NULL, cancel_reason = NULL,
                history = JSON_ARRAY_APPEND(COALESCE(history, JSON_ARRAY()), '$', JSON_EXTRACT(?, '$'))
          WHERE id = ? ${ownershipClause}`,
        [status, entry, req.params.id, ...ownershipParams]
      );
    }
    if (!updated.affectedRows) {
      await db.rollback();
      return res.status(409).json({ error: 'The assignment changed. Refresh your tasks before continuing.' });
    }
    await db.commit();

    return res.status(200).json({ success: true, status });
  } catch (error) {
    if (db) await db.rollback();
    if (error instanceof VendorPricingError) return res.status(error.status).json({ error: error.message });
    console.error('[PUT /api/provider/bookings/[id]]', error);
    return res.status(500).json({ error: 'Failed to update booking status' });
  } finally {
    db?.release();
  }
});

export default router;
