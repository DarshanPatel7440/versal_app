'use strict';

const crypto = require('crypto');
const { activateSubscription } = require('./subscription-manager');

/**
 * Webhook Handler
 *
 * Processes Razorpay webhook events for payment confirmation.
 * Handles signature verification, payload extraction, and
 * idempotent payment processing.
 */

/**
 * Verify the Razorpay webhook signature using HMAC-SHA256.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param {Buffer} rawBody - Raw request body as a Buffer
 * @param {string} signature - X-Razorpay-Signature header value
 * @param {string} secret - Webhook secret from Razorpay dashboard
 * @returns {boolean} true if signature is valid, false otherwise
 */
function verifySignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Both must be the same length for timingSafeEqual
  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Extract payment event data from a Razorpay webhook payload.
 * Only processes `payment_link.paid` events.
 *
 * Razorpay webhook structure for payment_link.paid:
 * {
 *   "event": "payment_link.paid",
 *   "payload": {
 *     "payment_link": {
 *       "entity": {
 *         "id": "plink_xxx",
 *         "reference_id": "subscription_id_here",
 *         "amount": 100000
 *       }
 *     },
 *     "payment": {
 *       "entity": {
 *         "id": "pay_xxx",
 *         "amount": 100000
 *       }
 *     }
 *   }
 * }
 *
 * @param {object} payload - Parsed webhook JSON payload
 * @returns {{subscription_id: string, razorpay_payment_id: string, amount_paise: number}|null}
 *   Extracted event data or null if event type doesn't match
 */
function extractPaymentEvent(payload) {
  if (!payload || payload.event !== 'payment_link.paid') {
    return null;
  }

  try {
    const paymentLink = payload.payload.payment_link.entity;
    const payment = payload.payload.payment.entity;

    const subscription_id = paymentLink.reference_id;
    const razorpay_payment_id = payment.id;
    const amount_paise = payment.amount;

    if (!subscription_id || !razorpay_payment_id || amount_paise == null) {
      return null;
    }

    return { subscription_id, razorpay_payment_id, amount_paise };
  } catch (err) {
    // Malformed payload structure
    return null;
  }
}

/**
 * Process a confirmed payment event.
 *
 * - Uses razorpay_payment_id as idempotency key (unique partial index on payments table)
 * - Updates subscription to "active" via activateSubscription
 * - Updates payment record to "captured" with razorpay_payment_id and paid_at
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {object} params
 * @param {string} params.subscription_id - UUID of the subscription (from reference_id)
 * @param {string} params.razorpay_payment_id - Razorpay payment identifier
 * @param {number} params.amount_paise - Payment amount in paise
 * @param {Date|string} params.paid_at - Payment timestamp
 * @returns {Promise<{success: boolean, already_processed: boolean}>}
 */
async function processPaymentEvent(pool, { subscription_id, razorpay_payment_id, amount_paise, paid_at }) {
  // 1. Idempotency check: see if a payment with this razorpay_payment_id already exists
  const existingPayment = await pool.query(
    'SELECT payment_id FROM payments WHERE razorpay_payment_id = $1',
    [razorpay_payment_id]
  );

  if (existingPayment.rows.length > 0) {
    return { success: true, already_processed: true };
  }

  // 2. Look up subscription to get billing_cycle_days
  const subResult = await pool.query(
    'SELECT subscription_id, billing_cycle_days FROM subscriptions WHERE subscription_id = $1',
    [subscription_id]
  );

  if (subResult.rows.length === 0) {
    // Subscription not found — log but don't fail (prevents Razorpay retries)
    return { success: true, already_processed: false };
  }

  const subscription = subResult.rows[0];
  const billing_cycle_days = subscription.billing_cycle_days || 30;

  // 3. Activate subscription
  await activateSubscription(pool, {
    subscription_id,
    razorpay_payment_id,
    paid_at,
    billing_cycle_days,
  });

  // 4. Update payment record to "captured"
  // Find the most recent pending payment for this subscription and update it
  await pool.query(
    `UPDATE payments
     SET status = 'captured',
         razorpay_payment_id = $1,
         paid_at = $2
     WHERE payment_id = (
       SELECT payment_id FROM payments
       WHERE subscription_id = $3
         AND status = 'pending'
         AND razorpay_payment_id IS NULL
       ORDER BY created_at DESC
       LIMIT 1
     )`,
    [razorpay_payment_id, paid_at, subscription_id]
  );

  return { success: true, already_processed: false };
}

module.exports = {
  verifySignature,
  extractPaymentEvent,
  processPaymentEvent,
};
