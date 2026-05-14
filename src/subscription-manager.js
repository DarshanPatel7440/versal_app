'use strict';

/**
 * Subscription Manager
 *
 * Manages subscription lifecycle: trial creation, access checks,
 * activation after payment, and subscription lookup.
 */

/**
 * Create a trial subscription for a device/product.
 * Looks up the plan from the plans table and creates a subscription
 * with status "trial" and trial_end_date = NOW() + 7 days.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {object} params
 * @param {string} params.device_id - Device identifier
 * @param {string} params.product - Product identifier (e.g., "talk2tally")
 * @param {string} [params.plan_name] - Optional plan name; defaults to first active plan for product
 * @returns {Promise<object>} The created subscription record
 */
async function createTrialSubscription(pool, { device_id, product, plan_name }) {
  if (!device_id || typeof device_id !== 'string') {
    throw new Error('device_id is required and must be a non-empty string');
  }
  if (!product || typeof product !== 'string') {
    throw new Error('product is required and must be a non-empty string');
  }

  // Look up plan from plans table
  let planQuery;
  let planValues;

  if (plan_name) {
    planQuery = `
      SELECT plan_id, product, plan_name, amount_paise, billing_cycle_days
      FROM plans
      WHERE product = $1 AND plan_name = $2 AND is_active = true
      LIMIT 1
    `;
    planValues = [product, plan_name];
  } else {
    planQuery = `
      SELECT plan_id, product, plan_name, amount_paise, billing_cycle_days
      FROM plans
      WHERE product = $1 AND is_active = true
      ORDER BY created_at ASC
      LIMIT 1
    `;
    planValues = [product];
  }

  const planResult = await pool.query(planQuery, planValues);
  if (planResult.rows.length === 0) {
    throw new Error(`No active plan found for product: ${product}${plan_name ? `, plan: ${plan_name}` : ''}`);
  }

  const plan = planResult.rows[0];

  // Create subscription with trial status
  const insertQuery = `
    INSERT INTO subscriptions (
      device_id, product, plan_name, status,
      amount_paise, billing_cycle_days, trial_end_date
    ) VALUES ($1, $2, $3, 'trial', $4, $5, NOW() + INTERVAL '7 days')
    RETURNING *
  `;

  const insertValues = [
    device_id,
    product,
    plan.plan_name,
    plan.amount_paise,
    plan.billing_cycle_days,
  ];

  const result = await pool.query(insertQuery, insertValues);
  return result.rows[0];
}

/**
 * Check access status for a device/product combination.
 * Returns "active" if subscription is in trial with future trial_end_date,
 * or status is "active" with future/null expires_at.
 * Returns "inactive" for all other states.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {object} params
 * @param {string} params.device_id - Device identifier
 * @param {string} params.product - Product identifier
 * @returns {Promise<{status: string, subscription_id: string|null, expires_at: Date|null}>}
 */
async function checkAccess(pool, { device_id, product }) {
  if (!device_id || typeof device_id !== 'string') {
    throw new Error('device_id is required and must be a non-empty string');
  }
  if (!product || typeof product !== 'string') {
    throw new Error('product is required and must be a non-empty string');
  }

  const query = `
    SELECT subscription_id, status, trial_end_date, expires_at
    FROM subscriptions
    WHERE device_id = $1 AND product = $2
    LIMIT 1
  `;

  const result = await pool.query(query, [device_id, product]);

  if (result.rows.length === 0) {
    return { status: 'inactive', subscription_id: null, expires_at: null };
  }

  const sub = result.rows[0];

  // Active if trial with future trial_end_date
  if (sub.status === 'trial' && sub.trial_end_date && new Date(sub.trial_end_date) > new Date()) {
    return {
      status: 'active',
      subscription_id: sub.subscription_id,
      expires_at: sub.trial_end_date,
    };
  }

  // Active if status is "active" with future or null expires_at
  if (sub.status === 'active' && (sub.expires_at === null || new Date(sub.expires_at) > new Date())) {
    return {
      status: 'active',
      subscription_id: sub.subscription_id,
      expires_at: sub.expires_at,
    };
  }

  // All other states are inactive
  return {
    status: 'inactive',
    subscription_id: sub.subscription_id,
    expires_at: sub.expires_at,
  };
}

/**
 * Find a subscription by device_id and product.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {object} params
 * @param {string} params.device_id - Device identifier
 * @param {string} params.product - Product identifier
 * @returns {Promise<object|null>} Subscription record or null
 */
async function findSubscription(pool, { device_id, product }) {
  if (!device_id || typeof device_id !== 'string') {
    throw new Error('device_id is required and must be a non-empty string');
  }
  if (!product || typeof product !== 'string') {
    throw new Error('product is required and must be a non-empty string');
  }

  const query = `
    SELECT *
    FROM subscriptions
    WHERE device_id = $1 AND product = $2
    LIMIT 1
  `;

  const result = await pool.query(query, [device_id, product]);
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Activate a subscription after successful payment.
 * Sets status to "active", records payment details, and calculates expires_at.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {object} params
 * @param {string} params.subscription_id - UUID of the subscription
 * @param {string} params.razorpay_payment_id - Razorpay payment identifier
 * @param {Date|string} params.paid_at - Payment timestamp
 * @param {number} params.billing_cycle_days - Number of days for the billing cycle
 * @returns {Promise<object>} The updated subscription record
 */
async function activateSubscription(pool, { subscription_id, razorpay_payment_id, paid_at, billing_cycle_days }) {
  if (!subscription_id || typeof subscription_id !== 'string') {
    throw new Error('subscription_id is required and must be a non-empty string');
  }
  if (!razorpay_payment_id || typeof razorpay_payment_id !== 'string') {
    throw new Error('razorpay_payment_id is required and must be a non-empty string');
  }
  if (!paid_at) {
    throw new Error('paid_at is required');
  }
  if (!Number.isInteger(billing_cycle_days) || billing_cycle_days < 1) {
    throw new Error('billing_cycle_days must be a positive integer');
  }

  const query = `
    UPDATE subscriptions
    SET status = 'active',
        paid_at = $1,
        razorpay_payment_id = $2,
        expires_at = $1::timestamptz + ($4 || ' days')::interval
    WHERE subscription_id = $3
    RETURNING *
  `;

  const values = [paid_at, razorpay_payment_id, subscription_id, billing_cycle_days.toString()];

  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    throw new Error(`Subscription not found: ${subscription_id}`);
  }
  return result.rows[0];
}

module.exports = {
  createTrialSubscription,
  checkAccess,
  findSubscription,
  activateSubscription,
};
