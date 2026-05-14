import { getPool } from './db';
import { createPaymentLink } from './razorpay-client';

const PAYMENT_LINK_EXPIRY_HOURS = 24;

export async function createSubscriptionPaymentLink({ subscription_id, metadata }) {
  const pool = getPool();

  if (!subscription_id || typeof subscription_id !== 'string') {
    throw new Error('subscription_id is required');
  }

  const subResult = await pool.query(
    'SELECT * FROM subscriptions WHERE subscription_id = $1',
    [subscription_id]
  );

  if (subResult.rows.length === 0) {
    const err = new Error('Subscription not found');
    err.statusCode = 404;
    throw err;
  }

  const subscription = subResult.rows[0];

  // Idempotency: return existing non-expired link
  if (subscription.payment_link_id && subscription.payment_link_expires_at) {
    const expiresAt = new Date(subscription.payment_link_expires_at);
    if (expiresAt > new Date()) {
      return {
        payment_link_url: subscription.payment_link_url,
        payment_link_id: subscription.payment_link_id,
        expires_at: expiresAt,
      };
    }
  }

  const expireBy = Math.floor(Date.now() / 1000) + (PAYMENT_LINK_EXPIRY_HOURS * 60 * 60);
  const description = `Payment for ${subscription.product || 'talk2tally'} - Device ${subscription.device_id}`;

  const razorpayResult = await createPaymentLink({
    amount_paise: subscription.amount_paise,
    currency: 'INR',
    description,
    reference_id: subscription_id,
    expire_by: expireBy,
    metadata: metadata || {},
  });

  const expiresAt = new Date(razorpayResult.expire_by * 1000);

  await pool.query(
    `INSERT INTO payments (
      subscription_id, amount_paise, currency, status, payment_type,
      razorpay_link_id, reference_id, short_url, metadata, expires_at
    ) VALUES ($1, $2, 'INR', 'pending', 'subscription', $3, $4, $5, $6, $7)`,
    [subscription_id, subscription.amount_paise, razorpayResult.payment_link_id,
     subscription_id, razorpayResult.short_url, JSON.stringify(metadata || {}), expiresAt]
  );

  await pool.query(
    `UPDATE subscriptions SET payment_link_id = $1, payment_link_url = $2, payment_link_expires_at = $3
     WHERE subscription_id = $4`,
    [razorpayResult.payment_link_id, razorpayResult.short_url, expiresAt, subscription_id]
  );

  return {
    payment_link_url: razorpayResult.short_url,
    payment_link_id: razorpayResult.payment_link_id,
    expires_at: expiresAt,
  };
}

export async function createGenericPaymentLink({ amount_paise, description, reference_id, metadata, callback_url }) {
  const pool = getPool();

  if (!amount_paise || typeof amount_paise !== 'number' || amount_paise <= 0) {
    throw new Error('amount_paise is required and must be a positive number');
  }
  if (!description) throw new Error('description is required');
  if (!reference_id) throw new Error('reference_id is required');

  const expireBy = Math.floor(Date.now() / 1000) + (PAYMENT_LINK_EXPIRY_HOURS * 60 * 60);

  const razorpayResult = await createPaymentLink({
    amount_paise, currency: 'INR', description, reference_id,
    expire_by: expireBy, callback_url, metadata: metadata || {},
  });

  const expiresAt = new Date(razorpayResult.expire_by * 1000);
  const paymentType = (metadata && metadata.payment_type) || 'subscription';
  const validTypes = ['subscription', 'recharge', 'addon', 'upgrade'];
  const resolvedType = validTypes.includes(paymentType) ? paymentType : 'subscription';

  await pool.query(
    `INSERT INTO payments (
      subscription_id, amount_paise, currency, status, payment_type,
      razorpay_link_id, reference_id, short_url, metadata, expires_at
    ) VALUES ($1, $2, 'INR', 'pending', $3, $4, $5, $6, $7, $8)`,
    [reference_id, amount_paise, resolvedType, razorpayResult.payment_link_id,
     reference_id, razorpayResult.short_url, JSON.stringify(metadata || {}), expiresAt]
  );

  return {
    payment_link_url: razorpayResult.short_url,
    payment_link_id: razorpayResult.payment_link_id,
    expires_at: expiresAt,
  };
}
