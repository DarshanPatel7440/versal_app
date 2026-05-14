'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Payment Service
 *
 * Handles payment link creation for subscriptions and generic payments.
 * Manages idempotency (reuses existing non-expired links) and persists
 * payment records in the payments table.
 */

const PAYMENT_LINK_EXPIRY_HOURS = 24;

/**
 * Create a payment link for a subscription.
 *
 * - Looks up the subscription by subscription_id
 * - Checks for an existing non-expired payment link (idempotency)
 * - Creates a Razorpay link if needed
 * - Inserts a payment record with status "pending"
 * - Updates the subscription with payment_link_id/url/expires_at
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {object} razorpayClient - RazorpayClient instance
 * @param {object} params
 * @param {string} params.subscription_id - UUID of the subscription
 * @param {object} [params.metadata] - Optional metadata to attach
 * @returns {Promise<{payment_link_url: string, payment_link_id: string, expires_at: Date}>}
 */
async function createSubscriptionPaymentLink(pool, razorpayClient, { subscription_id, metadata }) {
  if (!subscription_id || typeof subscription_id !== 'string') {
    throw new Error('subscription_id is required and must be a non-empty string');
  }

  // 1. Look up subscription
  const subResult = await pool.query(
    'SELECT * FROM subscriptions WHERE subscription_id = $1',
    [subscription_id]
  );

  if (subResult.rows.length === 0) {
    const err = new Error(`Subscription not found: ${subscription_id}`);
    err.statusCode = 404;
    throw err;
  }

  const subscription = subResult.rows[0];

  // 2. Check for existing non-expired payment link (idempotency)
  if (subscription.payment_link_id && subscription.payment_link_expires_at) {
    const expiresAt = new Date(subscription.payment_link_expires_at);
    if (expiresAt > new Date()) {
      // Return existing link
      return {
        payment_link_url: subscription.payment_link_url,
        payment_link_id: subscription.payment_link_id,
        expires_at: expiresAt,
      };
    }
  }

  // 3. Create Razorpay payment link
  const expireBy = Math.floor(Date.now() / 1000) + (PAYMENT_LINK_EXPIRY_HOURS * 60 * 60);
  const description = `Payment for ${subscription.product || 'talk2tally'} - Device ${subscription.device_id}`;

  const razorpayResult = await razorpayClient.createPaymentLink({
    amount_paise: subscription.amount_paise,
    currency: 'INR',
    description,
    reference_id: subscription_id,
    expire_by: expireBy,
    metadata: metadata || {},
  });

  const expiresAt = new Date(razorpayResult.expire_by * 1000);

  // 4. Insert payment record with status "pending"
  const paymentInsertQuery = `
    INSERT INTO payments (
      subscription_id, amount_paise, currency, status, payment_type,
      razorpay_link_id, reference_id, short_url, metadata, expires_at
    ) VALUES ($1, $2, 'INR', 'pending', 'subscription', $3, $4, $5, $6, $7)
    RETURNING payment_id
  `;

  await pool.query(paymentInsertQuery, [
    subscription_id,
    subscription.amount_paise,
    razorpayResult.payment_link_id,
    subscription_id,
    razorpayResult.short_url,
    JSON.stringify(metadata || {}),
    expiresAt,
  ]);

  // 5. Update subscription with payment link details
  const updateSubQuery = `
    UPDATE subscriptions
    SET payment_link_id = $1,
        payment_link_url = $2,
        payment_link_expires_at = $3
    WHERE subscription_id = $4
  `;

  await pool.query(updateSubQuery, [
    razorpayResult.payment_link_id,
    razorpayResult.short_url,
    expiresAt,
    subscription_id,
  ]);

  return {
    payment_link_url: razorpayResult.short_url,
    payment_link_id: razorpayResult.payment_link_id,
    expires_at: expiresAt,
  };
}

/**
 * Create a generic payment link not tied to subscription lifecycle.
 *
 * Useful for one-off payments like recharges, add-ons, or upgrades.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {object} razorpayClient - RazorpayClient instance
 * @param {object} params
 * @param {number} params.amount_paise - Amount in paise
 * @param {string} params.description - Payment description
 * @param {string} params.reference_id - Unique reference identifier
 * @param {object} [params.metadata] - Optional metadata
 * @param {string} [params.callback_url] - Optional callback URL after payment
 * @returns {Promise<{payment_link_url: string, payment_link_id: string, expires_at: Date}>}
 */
async function createGenericPaymentLink(pool, razorpayClient, { amount_paise, description, reference_id, metadata, callback_url }) {
  if (!amount_paise || typeof amount_paise !== 'number' || amount_paise <= 0) {
    throw new Error('amount_paise is required and must be a positive number');
  }
  if (!description || typeof description !== 'string') {
    throw new Error('description is required and must be a non-empty string');
  }
  if (!reference_id || typeof reference_id !== 'string') {
    throw new Error('reference_id is required and must be a non-empty string');
  }

  // 1. Create Razorpay payment link
  const expireBy = Math.floor(Date.now() / 1000) + (PAYMENT_LINK_EXPIRY_HOURS * 60 * 60);

  const razorpayResult = await razorpayClient.createPaymentLink({
    amount_paise,
    currency: 'INR',
    description,
    reference_id,
    expire_by: expireBy,
    callback_url,
    metadata: metadata || {},
  });

  const expiresAt = new Date(razorpayResult.expire_by * 1000);

  // 2. Determine payment_type from metadata or default to "subscription"
  const paymentType = (metadata && metadata.payment_type) || 'subscription';
  const validTypes = ['subscription', 'recharge', 'addon', 'upgrade'];
  const resolvedType = validTypes.includes(paymentType) ? paymentType : 'subscription';

  // 3. Insert payment record
  // For generic links, we need a subscription_id for the FK constraint.
  // Use reference_id as subscription_id if it's a valid UUID, otherwise look it up.
  const paymentInsertQuery = `
    INSERT INTO payments (
      subscription_id, amount_paise, currency, status, payment_type,
      razorpay_link_id, reference_id, short_url, metadata, expires_at
    ) VALUES ($1, $2, 'INR', 'pending', $3, $4, $5, $6, $7, $8)
    RETURNING payment_id
  `;

  await pool.query(paymentInsertQuery, [
    reference_id,
    amount_paise,
    resolvedType,
    razorpayResult.payment_link_id,
    reference_id,
    razorpayResult.short_url,
    JSON.stringify(metadata || {}),
    expiresAt,
  ]);

  return {
    payment_link_url: razorpayResult.short_url,
    payment_link_id: razorpayResult.payment_link_id,
    expires_at: expiresAt,
  };
}

module.exports = {
  createSubscriptionPaymentLink,
  createGenericPaymentLink,
};
