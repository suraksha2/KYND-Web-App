import { Router } from 'express';
import pool from '../lib/mysql';
import { requireCustomerSession } from '../http/session';

const router = Router();
router.use(requireCustomerSession);

export function isReviewableBooking(
  status: string,
  schedule: string,
  hasCompletedVisit: boolean
): boolean {
  return schedule === 'recurring' ? hasCompletedVisit : status === 'completed';
}

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const { bookingId, rating, comment = '' } = body;

    const numericRating = Number(rating);
    if (!bookingId || !Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ error: 'Booking ID and a rating between 1 and 5 are required.' });
    }

    const session = req.session!;

    const [bookings]: any = await pool.query(
      `SELECT b.id, b.user_id, b.status, b.schedule,
              COALESCE((
                SELECT COALESCE(o.provider_id, b.provider_id)
                  FROM booking_occurrences o
                 WHERE o.booking_id = b.id AND o.status = 'completed'
                 ORDER BY o.completed_at DESC, o.seq DESC LIMIT 1
              ), b.provider_id) AS provider_id,
              EXISTS (
                SELECT 1 FROM booking_occurrences o
                 WHERE o.booking_id = b.id AND o.status = 'completed'
              ) AS has_completed_visit
         FROM bookings b WHERE b.id = ?`,
      [bookingId]
    );

    if (!bookings || bookings.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = bookings[0];

    if (booking.user_id == null || Number(booking.user_id) !== Number(session.id)) {
      return res.status(403).json({ error: 'You can only review your own bookings.' });
    }
    if (!isReviewableBooking(
      booking.status,
      booking.schedule,
      Boolean(Number(booking.has_completed_visit))
    )) {
      return res.status(409).json({ error: 'You can review a booking after its service or a visit is completed.' });
    }

    await pool.query(
      `INSERT INTO reviews (booking_id, user_id, provider_id, rating, comment, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         rating = VALUES(rating),
         comment = VALUES(comment),
         updated_at = NOW()`,
      [bookingId, session.id, booking.provider_id, numericRating, comment]
    );

    let providerRating = null;
    let reviewCount = 0;

    if (booking.provider_id) {
      const [agg]: any = await pool.query(
        'SELECT AVG(rating) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE provider_id = ?',
        [booking.provider_id]
      );

      const avg = Number(agg[0].avg_rating || 0).toFixed(2);
      reviewCount = agg[0].review_count || 0;
      await pool.query(
        'UPDATE service_providers SET rating = ?, review_count = ? WHERE id = ?',
        [avg, reviewCount, booking.provider_id]
      );
      providerRating = Number(avg);
    }

    return res.status(201).json({ success: true, providerRating, reviewCount });
  } catch (error) {
    console.error('[POST /api/reviews]', error);
    return res.status(500).json({ error: 'Failed to submit review' });
  }
});

export default router;
