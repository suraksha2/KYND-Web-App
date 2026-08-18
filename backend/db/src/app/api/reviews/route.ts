import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';

function getSessionToken(request: NextRequest): string | undefined {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return request.cookies.get(SESSION_COOKIE_NAME)?.value;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bookingId, rating, comment = '' } = body;

    if (!bookingId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Booking ID and a rating between 1 and 5 are required.' },
        { status: 400 }
      );
    }

    const session = await verifySessionToken(getSessionToken(req));
    if (!session) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const [bookings]: any = await pool.query(
      'SELECT id, provider_id, user_id FROM bookings WHERE id = ?',
      [bookingId]
    );

    if (!bookings || bookings.length === 0) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    }

    const booking = bookings[0];

    if (booking.user_id != null && Number(booking.user_id) !== Number(session.id)) {
      console.warn('[POST /api/reviews] Forbidden:', { bookingId, bookingUserId: booking.user_id, sessionId: session.id });
      return NextResponse.json(
        { error: `You can only review your own bookings. (booking user_id=${booking.user_id}, session id=${session.id})` },
        { status: 403 }
      );
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

    return NextResponse.json({ success: true, providerRating, reviewCount }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/reviews]', error);
    return NextResponse.json(
      { error: 'Failed to submit review' },
      { status: 500 }
    );
  }
}
