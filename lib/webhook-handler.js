import crypto from 'crypto';
import { getPool } from './db';
import { activateSubscription } from './subscription-manager';

export function verifySignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;

  const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (sigBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

export function extractPaymentEvent(payload) {
  if (!payload || payload.event !== 'payment_link.paid') return null;

  try {
    const paymentLink = payload.payload.payment_link.entity;
    const payment = payload.payload.payment.entity;

    const subscription_id = paymentLink.reference_id;
    const razorpay_payment_id = payment.id;
    const amount_paise = payment.amount;

    if (!subscription_id || !razorpay_payment_id || amount_paise == null) return null;
    return { subscription_id, razorpay_payment_id, amount_paise };
  } catch {
    return null;
  }
}

export async function processPaymentEvent({ subscription_id, razorpay_payment_id, amount_paise, paid_at }) {
  const pool = getPool();

  // Idempotency check
  const existing = await pool.query(
    'SELECT payment_id FROM payments WHERE razorpay_payment_id = $1',
    [razorpay_payment_id]
  );
  if (existing.rows.length > 0) return { success: true, already_processed: true };

  const subResult = await pool.query(
    'SELECT subscription_id, billing_cycle_days FROM subscriptions WHERE subscription_id = $1',
    [subscription_id]
  );
  if (subResult.rows.length === 0) return { success: true, already_processed: false };

  const billing_cycle_days = subResult.rows[0].billing_cycle_days || 30;

  await activateSubscription({ subscription_id, razorpay_payment_id, paid_at, billing_cycle_days });

  await pool.query(
    `UPDATE payments SET status = 'captured', razorpay_payment_id = $1, paid_at = $2
     WHERE payment_id = (
       SELECT payment_id FROM payments
       WHERE subscription_id = $3 AND status = 'pending' AND razorpay_payment_id IS NULL
       ORDER BY created_at DESC LIMIT 1
     )`,
    [razorpay_payment_id, paid_at, subscription_id]
  );

  return { success: true, already_processed: false };
}
