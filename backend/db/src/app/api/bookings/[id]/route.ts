import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { sendProviderAssignmentWhatsApp } from '@/lib/whatsapp';
import { verifySessionToken, hasAdminAccess } from '@/lib/auth';

function getSessionToken(request: NextRequest): string | undefined {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return request.cookies.get('admin_session')?.value;
}

// PATCH cancel booking (for clients)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { status, reason, scheduledAt } = body;

    const formatDateTime = (isoString: string | null) => {
      if (!isoString) return null;
      return new Date(isoString).toISOString().slice(0, 19).replace('T', ' ');
    };

    // Reschedule booking
    if (scheduledAt) {
      const [rows]: any = await pool.query(
        'SELECT id, history, scheduled_at FROM bookings WHERE id = ?',
        [params.id]
      );

      if (!rows || rows.length === 0) {
        return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
      }

      const booking = rows[0];

      let history: any[] = [];
      try {
        history = typeof booking.history === 'string'
          ? JSON.parse(booking.history)
          : (booking.history || []);
        if (!Array.isArray(history)) history = [];
      } catch {
        history = [];
      }

      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      history.push({
        at: now,
        type: 'rescheduled',
        note: `Rescheduled to ${formatDateTime(scheduledAt)}`,
      });

      await pool.query(
        'UPDATE bookings SET scheduled_at = ?, schedule = ?, history = ? WHERE id = ?',
        [formatDateTime(scheduledAt), 'scheduled', JSON.stringify(history), params.id]
      );

      return NextResponse.json(
        { success: true, scheduledAt: formatDateTime(scheduledAt) },
        { status: 200 }
      );
    }

    if (!status || status !== 'cancelled') {
      return NextResponse.json(
        { error: 'Only cancellation is allowed via this endpoint' },
        { status: 400 }
      );
    }

    // Check if booking exists
    const [rows]: any = await pool.query(
      'SELECT id, history, contact_phone FROM bookings WHERE id = ?',
      [params.id]
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    }

    const booking = rows[0];

    // Append cancellation to history
    let history: any[] = [];
    try {
      history = typeof booking.history === 'string'
        ? JSON.parse(booking.history)
        : (booking.history || []);
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    history.push({
      at: now,
      type: 'cancelled',
      note: reason || 'Cancelled by client',
    });

    await pool.query(
      'UPDATE bookings SET status = ?, history = ? WHERE id = ?',
      [status, JSON.stringify(history), params.id]
    );

    return NextResponse.json({ success: true, status }, { status: 200 });
  } catch (error) {
    console.error('[PATCH /api/bookings/[id]]', error);
    return NextResponse.json(
      { error: 'Failed to cancel booking' },
      { status: 500 }
    );
  }
}

// PUT assign provider to booking
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const bookingId = params.id;
    const body = await req.json();
    const { provider_id } = body;

    // Only admins may assign a service provider to a customer booking.
    const session = await verifySessionToken(getSessionToken(req));
    if (!session || !hasAdminAccess(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Admin access required.' },
        { status: 403 }
      );
    }

    if (!provider_id) {
      return NextResponse.json(
        { error: 'Provider ID is required' },
        { status: 400 }
      );
    }

    // Format datetime for MySQL
    const assignedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Update booking with provider assignment
    const [result] = await pool.query(
      `UPDATE bookings 
       SET provider_id = ?, assigned_at = ?
       WHERE id = ?`,
      [provider_id, assignedAt, bookingId]
    );

    // Update provider's total_jobs count
    await pool.query(
      `UPDATE service_providers 
       SET total_jobs = total_jobs + 1 
       WHERE id = ?`,
      [provider_id]
    );

    // Fetch booking details
    const [bookingRows]: any = await pool.query(
      `SELECT b.booking_id, b.items, b.total, b.schedule, b.scheduled_at,
              b.contact_name, b.contact_phone, b.contact_address,
              b.contact_area, b.contact_city, b.contact_pincode, b.payment
       FROM bookings b
       WHERE b.id = ?`,
      [bookingId]
    );

    // Fetch provider details
    const [providerRows]: any = await pool.query(
      `SELECT name, mobile FROM service_providers WHERE id = ?`,
      [provider_id]
    );

    if (bookingRows.length > 0 && providerRows.length > 0) {
      const booking = bookingRows[0];
      const provider = providerRows[0];

      // Derive a human-readable service name from the items JSON
      let serviceName = 'Service';
      try {
        const items = typeof booking.items === 'string' ? JSON.parse(booking.items) : booking.items;
        if (Array.isArray(items) && items.length > 0) {
          serviceName = items.map((item: any) => item.name || item.serviceName || item.title || 'Service').join(', ');
        }
      } catch (_) {}

      await sendProviderAssignmentWhatsApp(provider.mobile, provider.name, {
        bookingId: booking.booking_id,
        serviceName,
        scheduledAt: booking.scheduled_at,
        schedule: booking.schedule,
        contactName: booking.contact_name,
        contactPhone: booking.contact_phone,
        contactAddress: booking.contact_address,
        contactArea: booking.contact_area,
        contactCity: booking.contact_city,
        contactPincode: booking.contact_pincode,
        total: booking.total,
        payment: booking.payment,
      });
    }

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (error) {
    console.error('[PUT /api/bookings/[id]]', error);
    return NextResponse.json(
      { error: 'Failed to assign provider to booking' },
      { status: 500 }
    );
  }
}
