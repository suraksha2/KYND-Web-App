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
    const {
      bookingId,
      items,
      total,
      schedule,
      scheduledAt,
      cadence,
      contact,
      payment,
      placedAt,
      status = 'upcoming'
    } = body;

    if (!bookingId || !items || !total || !contact || !payment) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Link to the logged-in customer if a valid token is present.
    const session = await verifySessionToken(getSessionToken(req));
    const userId = session?.id || null;

    // Convert ISO datetime to MySQL datetime format
    const formatDateTime = (isoString: string | null) => {
      if (!isoString) return null;
      return new Date(isoString).toISOString().slice(0, 19).replace('T', ' ');
    };

    const [result] = await pool.query(
      `INSERT INTO bookings (
        booking_id, items, total, schedule, scheduled_at, cadence,
        contact_name, contact_phone, contact_address, contact_city, contact_pincode, contact_area,
        payment, placed_at, status, history, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingId,
        JSON.stringify(items),
        total,
        schedule,
        formatDateTime(scheduledAt),
        cadence || null,
        contact.name,
        contact.phone,
        contact.address,
        contact.city,
        contact.pincode,
        contact.area || null,
        payment,
        formatDateTime(placedAt),
        status,
        JSON.stringify([{ at: formatDateTime(placedAt), type: 'created', note: 'Booking placed' }]),
        userId
      ]
    );

    const bookingDbId = (result as any).insertId;

    // Auto-assign a free provider in the same city for the booked service.
    const itemList = Array.isArray(items) ? items : JSON.parse(items || '[]');
    const firstItemName = itemList[0]?.name || itemList[0]?.serviceName || 'Service';

    const [providers]: any = await pool.query(
      `SELECT id, name, rating, total_jobs, avatar
       FROM service_providers
       WHERE LOWER(city) = LOWER(?)
         AND status = 'active'
         AND JSON_CONTAINS(services, ?)
       ORDER BY total_jobs ASC, rating DESC, id ASC
       LIMIT 1`,
      [contact.city, JSON.stringify(firstItemName)]
    );

    let provider = providers?.[0] || null;

    // Fall back to any active provider in the city if no exact service match.
    if (!provider) {
      const [fallback]: any = await pool.query(
        `SELECT id, name, rating, total_jobs, avatar
         FROM service_providers
         WHERE LOWER(city) = LOWER(?)
           AND status = 'active'
         ORDER BY total_jobs ASC, rating DESC, id ASC
         LIMIT 1`,
        [contact.city]
      );
      provider = fallback?.[0] || null;
    }

    if (provider) {
      const assignedAt = formatDateTime(new Date().toISOString());
      await pool.query(
        'UPDATE bookings SET provider_id = ?, assigned_at = ? WHERE id = ?',
        [provider.id, assignedAt, bookingDbId]
      );
      await pool.query(
        'UPDATE service_providers SET total_jobs = total_jobs + 1 WHERE id = ?',
        [provider.id]
      );
    }

    return NextResponse.json(
      {
        success: true,
        bookingId,
        id: bookingDbId,
        provider
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/bookings]', error);
    return NextResponse.json(
      { error: 'Failed to create booking' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await verifySessionToken(getSessionToken(request));
    if (!session) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    let query = `
      SELECT b.*,
             sp.id AS provider_id,
             sp.name AS provider_name,
             sp.rating AS provider_rating,
             sp.avatar AS provider_avatar,
             sp.mobile AS provider_mobile
      FROM bookings b
      LEFT JOIN service_providers sp ON b.provider_id = sp.id
      ORDER BY b.placed_at DESC
    `;
    const params: any[] = [];

    if (!['super_admin', 'admin'].includes(session.role || '')) {
      // Customer: show only their own bookings.
      query = `
        SELECT b.*,
               sp.id AS provider_id,
               sp.name AS provider_name,
               sp.rating AS provider_rating,
               sp.avatar AS provider_avatar,
               sp.mobile AS provider_mobile
        FROM bookings b
        LEFT JOIN service_providers sp ON b.provider_id = sp.id
        WHERE b.user_id = ?
        ORDER BY b.placed_at DESC
      `;
      params.push(session.id);
    }

    const [rows] = await pool.query(query, params);
    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/bookings]', error);
    return NextResponse.json(
      { error: 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}
