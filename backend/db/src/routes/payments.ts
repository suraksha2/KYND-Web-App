import { Router } from 'express';
import { createPaymentIntent, paymentCurrency, AirwallexConfigError, retrievePaymentIntent } from '../lib/airwallex';

const router = Router();

/**
 * Creates an Airwallex PaymentIntent for a checkout.
 *
 * Body: { amount: number, merchantOrderId: string, metadata?: object, returnUrl?: string }
 * Returns: { id, clientSecret, amount, currency, env }
 *
 * The amount is taken from the request for now, but should ideally be derived
 * from server-side cart/pricing data to fully prevent tampering.
 */
router.post('/create-intent', async (req, res) => {
  try {
    const body = req.body;
    const { amount, merchantOrderId, metadata, returnUrl } = body || {};

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'A positive "amount" is required.' });
    }
    if (!merchantOrderId || typeof merchantOrderId !== 'string') {
      return res.status(400).json({ error: '"merchantOrderId" is required.' });
    }

    const intent = await createPaymentIntent({
      // Round to 2 decimals to avoid floating point artifacts.
      amount: Math.round(numericAmount * 100) / 100,
      currency: paymentCurrency,
      merchantOrderId,
      metadata,
      returnUrl,
      descriptor: 'Helpr Services',
    });

    return res.status(201).json({
      id: intent.id,
      clientSecret: intent.client_secret,
      amount: intent.amount,
      currency: intent.currency,
    });
  } catch (error: any) {
    console.error('[POST /api/payments/create-intent]', error);
    // Misconfiguration (missing/placeholder credentials) is a server config issue,
    // not a transient failure — surface it distinctly so it's easy to diagnose.
    if (error instanceof AirwallexConfigError) {
      return res.status(503).json({ error: error.message });
    }
    return res.status(500).json({ error: error?.message || 'Failed to create payment intent.' });
  }
});

/**
 * Retrieves an Airwallex PaymentIntent so the client/server can verify its
 * status (e.g. SUCCEEDED) before treating an order as paid.
 *
 * GET /api/payments/:id -> { id, status, amount, currency, merchantOrderId }
 */
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Payment intent id is required.' });
    }

    const intent = await retrievePaymentIntent(id);

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
