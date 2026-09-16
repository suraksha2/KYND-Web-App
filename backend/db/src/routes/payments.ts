import { Router } from 'express';
import { createPaymentIntent, paymentCurrency, AirwallexConfigError, retrievePaymentIntent } from '../lib/airwallex';
import { getSession } from '../http/session';
import { priceOrder, PricingError } from '../lib/pricing';

const router = Router();

/**
 * Creates an Airwallex PaymentIntent for a checkout.
 *
 * Body: { items, addOns?, schedule?, offer?, merchantOrderId, metadata?, returnUrl? }
 * Amount is always derived server-side from catalog pricing.
 */
router.post('/create-intent', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const body = req.body || {};
    const { merchantOrderId, metadata, returnUrl, items, addOns, schedule, offer } = body;

    if (!merchantOrderId || typeof merchantOrderId !== 'string' || merchantOrderId.length > 128) {
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
      userId: session.id,
      scheduledAt: body.scheduledAt || null,
    });

    const intent = await createPaymentIntent({
      amount: priced.total,
      currency: paymentCurrency,
      merchantOrderId,
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
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const id = req.params.id;
    if (!id || typeof id !== 'string' || id.length > 128) {
      return res.status(400).json({ error: 'Payment intent id is required.' });
    }

    const intent = await retrievePaymentIntent(id);

    const meta = (intent as any)?.metadata || {};
    const metaUserId = meta.userId != null ? Number(meta.userId) : null;
    if (metaUserId != null && Number.isFinite(metaUserId) && metaUserId !== Number(session.id)) {
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
