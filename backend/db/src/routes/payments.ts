import { Router } from 'express';
import { createPaymentIntent, paymentCurrency, AirwallexConfigError, retrievePaymentIntent } from '../lib/airwallex';
import { requireCustomerSession } from '../http/session';
import { priceOrder, PricingError } from '../lib/pricing';

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
 * Body: { items, addOns?, schedule?, offer?, merchantOrderId, metadata?, returnUrl? }
 * Amount is always derived server-side from catalog pricing.
 */
router.post('/create-intent', async (req, res) => {
  try {
    const session = req.session!;

    const body = req.body || {};
    const {
      merchantOrderId, metadata, returnUrl, items, addOns, schedule, offer,
      referralCode,
    } = body;

    if (
      typeof merchantOrderId !== 'string'
      || !merchantOrderId.trim()
      || merchantOrderId.length > 50
    ) {
      return res.status(400).json({ error: '"merchantOrderId" is required.' });
    }
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Order items are required to price the payment.' });
    }

    const priced = await priceOrder({
      items,
      addOns,
      schedule,
      offer,
      referralCode,
      userId: session.id,
      scheduledAt: body.scheduledAt || null,
    });

    const intent = await createPaymentIntent({
      amount: priced.total,
      currency: paymentCurrency,
      merchantOrderId: merchantOrderId.trim(),
      metadata: {
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
        userId: String(session.id),
        total: String(priced.total),
        discount: String(priced.discount),
      },
      returnUrl,
      descriptor: 'Helpr Services',
    });

    return res.status(201).json({
      id: intent.id,
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
      return res.status(503).json({ error: error.message });
    }
    return res.status(500).json({ error: error?.message || 'Failed to create payment intent.' });
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
    if (!id || typeof id !== 'string' || id.length > 128) {
      return res.status(400).json({ error: 'Payment intent id is required.' });
    }

    const intent = await retrievePaymentIntent(id);
    if (String(intent.id || '') !== id) {
      return res.status(404).json({ error: 'Payment intent not found.' });
    }

    const meta = (intent as any)?.metadata || {};
    const metaUserId = meta.userId != null ? Number(meta.userId) : null;
    if (metaUserId == null || !Number.isFinite(metaUserId) || metaUserId !== Number(session.id)) {
      return res.status(403).json({ error: 'Payment intent not found.' });
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
    return res.status(500).json({ error: error?.message || 'Failed to retrieve payment intent.' });
  }
});

export default router;
