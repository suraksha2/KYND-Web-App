import { Router } from 'express';
import pool from '../lib/mysql';
import { getSession } from '../http/session';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const { bookingId, rating, comment = '' } = body;

    if (!bookingId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Booking ID and a rating between 1 and 5 are required.' });
    }

    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const [bookings]: any = await pool.query(
      'SELECT id, provider_id, user_id FROM bookings WHERE id = ?',
      [bookingId]
    );

    if (!bookings || bookings.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = bookings[0];

    if (booking.user_id != null && Number(booking.user_id) !== Number(session.id)) {
      console.warn('[POST /api/reviews] Forbidden:', { bookingId, bookingUserId: booking.user_id, sessionId: session.id });
      return res.status(403).json({ error: `You can only review your own bookings. (booking user_id=${booking.user_id}, session id=${session.id})` });
    }

    // Claim an unlinked booking for the currently logged-in customer.
    if (booking.user_id == null) {
      await pool.query('UPDATE bookings SET user_id = ? WHERE id = ?', [session.id, bookingId]);
    }

    await pool.query(
      `INSERT INTO reviews (booking_id, user_id, provider_id, rating, comment, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         rating = VALUES(rating),
         comment = VALUES(comment),
         updated_at = NOW()`,
      [bookingId, session.id, booking.provider_id, rating, comment]
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
