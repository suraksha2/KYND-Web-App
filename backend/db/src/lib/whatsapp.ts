const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

interface BookingDetails {
  bookingId: string;
  serviceName: string;
  scheduledAt: string | null;
  schedule: string;
  contactName: string;
  contactPhone: string;
  contactAddress: string;
  contactArea: string | null;
  contactCity: string;
  contactPincode: string;
  notes?: string | null;
  total: number;
  payment: string;
}

export async function sendProviderAssignmentWhatsApp(
  providerPhone: string,
  providerName: string,
  booking: BookingDetails
): Promise<{ success: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!token || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.error('[WhatsApp] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
    return { success: false, error: 'WhatsApp credentials not configured' };
  }

  // Normalize phone: strip non-digits, ensure country code
  let phone = providerPhone.replace(/\D/g, '');
  if (!phone.startsWith('91') && phone.length === 10) {
    phone = '91' + phone;
  }

  // MySQL DATETIME values are stored as Singapore local time (SGT).
  function parseSgt(value: string | null) {
    if (!value) return null;
    if (/[Z+-]/.test(value)) return new Date(value);
    return new Date(value.replace(' ', 'T') + '+08:00');
  }

  const scheduleInfo =
    booking.schedule === 'instant'
      ? 'Instant (ASAP)'
      : booking.scheduledAt
      ? (parseSgt(booking.scheduledAt)?.toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) ?? booking.schedule)
      : booking.schedule;

  const addressLine = [
    booking.contactAddress,
    booking.contactArea,
    booking.contactCity,
    booking.contactPincode,
  ]
    .filter(Boolean)
    .join(', ');

  const messageText =
    `Hi ${providerName} 👋\n\n` +
    `You have been assigned a new service booking on *Helpr*.\n\n` +
    `📋 *Booking Details*\n` +
    `Booking ID: ${booking.bookingId}\n` +
    `Service: ${booking.serviceName}\n` +
    `Schedule: ${scheduleInfo}\n\n` +
    `👤 *Customer Details*\n` +
    `Name: ${booking.contactName}\n` +
    `Phone: ${booking.contactPhone}\n` +
    `Address: ${addressLine}\n\n` +
    (booking.notes ? `📝 *Instructions*\n${booking.notes}\n\n` : '') +
    `💰 Amount: S$${Number(booking.total).toLocaleString('en-SG')}\n` +
    `Payment: ${booking.payment}\n\n` +
    `Please reach the customer on time. Thank you! 🙏`;

  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: messageText },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[WhatsApp] API error:', data);
      return { success: false, error: data?.error?.message || 'WhatsApp API error' };
    }

    return { success: true };
  } catch (err) {
    console.error('[WhatsApp] Fetch error:', err);
    return { success: false, error: 'Failed to send WhatsApp message' };
  }
}
