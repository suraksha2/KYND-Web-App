import { parseSgt } from './sgt';

const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

interface BookingDetails {
  bookingId: string;
  serviceName: string;
  scheduledAt: string | null;
  schedule: string;
  cadence?: string | null;
  visitSeq?: number | null;
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

  // A recurring visit is a reminder for one date in an ongoing plan, not a brand
  // new assignment, so it gets its own opening line.
  const isRecurringVisit = booking.schedule === 'recurring' && !!booking.visitSeq;
  const intro = isRecurringVisit
    ? `Your next visit for a recurring booking on *Helpr* is coming up.\n\n`
    : `You have been assigned a new service booking on *Helpr*.\n\n`;

  const messageText =
    `Hi ${providerName} 👋\n\n` +
    intro +
    `📋 *Booking Details*\n` +
    `Booking ID: ${booking.bookingId}\n` +
    (isRecurringVisit ? `Visit: #${booking.visitSeq}\n` : '') +
    `Service: ${booking.serviceName}\n` +
    `Schedule: ${scheduleInfo}\n` +
    (booking.schedule === 'recurring' && booking.cadence ? `Repeats: ${booking.cadence}\n` : '') +
    `\n` +
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
