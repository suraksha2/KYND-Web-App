import { Router } from 'express';
import { createPaymentIntent, paymentCurrency, AirwallexConfigError, retrievePaymentIntent } from '../lib/airwallex';
import { requireCustomerSession } from '../http/session';
import { priceOrder, PricingError } from '../lib/pricing';
import { paymentIntentBelongsToUser } from '../lib/paymentVerification';
import { validatePaymentReturnUrl } from '../lib/paymentReturnUrl';
import {
  newBookingReference, normalizeBookingContact, parseIsoDateTime,
} from '../lib/bookingInput';

const router = Router();
router.use(requireCustomerSession);

router.post('/quote', async (req, res) => {
  try {
    const session = req.session!;
    const body = req.body || {};
    const priced = await priceOrder({
      items: body.items,
      addOns: body.addOns,
      schedule: body.schedule,
      offer: body.offer,
      referralCode: body.referralCode,
      userId: session.id,
      scheduledAt: body.scheduledAt || null,
    });
    return res.json(priced);
  } catch (error: any) {
    if (error instanceof PricingError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[POST /api/payments/quote]', error);
    return res.status(500).json({ error: 'Failed to price this order.' });
  }
});

/**
 * Creates an Airwallex PaymentIntent for a checkout.
 *
 * Body: { items, addOns?, schedule, scheduledAt?, contact, offer?, returnUrl? }
 * Amount and merchant order reference are generated server-side.
 */
router.post('/create-intent', async (req, res) => {
  try {
    const session = req.session!;

    const body = req.body || {};
    const {
      returnUrl, items, addOns, schedule, offer, contact,
      referralCode,
    } = body;

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Order items are required to price the payment.' });
    }
    if (!['instant', 'scheduled', 'recurring'].includes(schedule)) {
      return res.status(400).json({ error: 'Invalid booking schedule.' });
    }
    if (!normalizeBookingContact(contact)) {
      return res.status(400).json({ error: 'Invalid contact or address details.' });
    }

    const scheduledDate = schedule === 'instant' ? null : parseIsoDateTime(body.scheduledAt);
    if (schedule !== 'instant' && (!scheduledDate || scheduledDate.getTime() <= Date.now())) {
      return res.status(400).json({ error: 'A valid future booking time is required.' });
    }

    let validatedReturnUrl: string | undefined;
    if (returnUrl != null) {
      const validated = validatePaymentReturnUrl(returnUrl);
      if (!validated) {
        return res.status(400).json({ error: 'Payment return URL is not allowed.' });
      }
      validatedReturnUrl = validated;
    }

    const priced = await priceOrder({
      items,
      addOns,
      schedule,
      offer,
      referralCode,
      userId: session.id,
      scheduledAt: scheduledDate?.toISOString() || null,
    });

    const bookingId = newBookingReference();
    const intent = await createPaymentIntent({
      amount: priced.total,
      currency: paymentCurrency,
      merchantOrderId: bookingId,
      metadata: {
        userId: String(session.id),
        bookingId,
        total: String(priced.total),
        discount: String(priced.discount),
      },
      returnUrl: validatedReturnUrl,
      descriptor: 'Helpr Services',
    });

    return res.status(201).json({
      id: intent.id,
      bookingId,
      clientSecret: intent.client_secret,
      amount: intent.amount,
      currency: intent.currency,
      pricedTotal: priced.total,
      discount: priced.discount,
      items: priced.items,
      addOns: priced.addOns,
    });
  } catch (error: any) {
    console.error('[POST /api/payments/create-intent]', error);
    if (error instanceof PricingError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof AirwallexConfigError) {
      return res.status(503).json({ error: 'Payments are temporarily unavailable.' });
    }
    return res.status(500).json({ error: 'Failed to create payment intent.' });
  }
});

/**
 * Retrieves an Airwallex PaymentIntent so the client can verify status
 * before treating an order as paid.
 */
router.get('/:id', async (req, res) => {
  try {
    const session = req.session!;

    const id = req.params.id;
    if (!id || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
      return res.status(400).json({ error: 'Payment intent id is required.' });
    }

    const intent = await retrievePaymentIntent(id);
    if (String(intent.id || '') !== id) {
      return res.status(404).json({ error: 'Payment intent not found.' });
    }

    if (!paymentIntentBelongsToUser(intent, session.id)) {
      return res.status(404).json({ error: 'Payment intent not found.' });
    }

    return res.status(200).json({
      id: intent.id,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
      merchantOrderId: intent.merchant_order_id,
    });
  } catch (error: any) {
    console.error('[GET /api/payments/[id]]', error);
    return res.status(500).json({ error: 'Failed to retrieve payment intent.' });
  }
});

export default router;
