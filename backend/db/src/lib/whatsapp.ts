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

async function sendWhatsAppText(
  rawPhone: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!token || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.error('[WhatsApp] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
    return { success: false, error: 'WhatsApp credentials not configured' };
  }

  // Normalize phone: strip non-digits, ensure country code
  let phone = rawPhone.replace(/\D/g, '');
  if (!phone.startsWith('91') && !phone.startsWith('65') && phone.length === 10) {
    phone = '91' + phone;
  }

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
        text: { body },
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

export async function sendProviderAssignmentWhatsApp(
  providerPhone: string,
  providerName: string,
  booking: BookingDetails
): Promise<{ success: boolean; error?: string }> {

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

  return sendWhatsAppText(providerPhone, messageText);
}

export interface MissedJobAlert {
  bookingId: string;
  serviceName: string;
  visitSeq?: number | null;
  dueAt: string; // SGT wall-clock string
  minsLate: number;
  providerName: string | null;
  contactName: string;
  contactArea: string | null;
  contactCity: string;
}

/**
 * One consolidated alert to the admin listing every job that blew its slot
 * without being marked done. A single message keeps the alert readable when a
 * run finds several missed visits at once.
 */
export async function sendMissedJobsWhatsApp(
  adminPhone: string,
  jobs: MissedJobAlert[]
): Promise<{ success: boolean; error?: string }> {
  const lines = jobs.map((job, i) => {
    const late =
      job.minsLate < 60
        ? `${job.minsLate} min late`
        : `${Math.floor(job.minsLate / 60)}h${job.minsLate % 60 ? ` ${job.minsLate % 60}m` : ''} late`;
    const when = parseSgt(job.dueAt)?.toLocaleString('en-SG', {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
      timeZone: 'Asia/Singapore',
    }) ?? job.dueAt;
    const where = [job.contactArea, job.contactCity].filter(Boolean).join(', ');
    return (
      `${i + 1}. ${job.bookingId} · ${job.serviceName}` +
      (job.visitSeq ? ` (visit #${job.visitSeq})` : '') +
      `\n   ${job.contactName}, ${where} — due ${when} · ${late}` +
      `\n   Provider: ${job.providerName || 'Unassigned'}`
    );
  });

  const messageText =
    `🚨 *Missed job alert — ${jobs.length} ${jobs.length === 1 ? 'job is' : 'jobs are'} overdue and not marked done*\n\n` +
    lines.join('\n\n') +
    `\n\nPlease follow up with the provider or reschedule the visit.`;

  return sendWhatsAppText(adminPhone, messageText);
}
