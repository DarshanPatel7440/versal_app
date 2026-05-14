import { getPool } from './db';

export async function createTrialSubscription({ device_id, product, plan_name }) {
  const pool = getPool();

  if (!device_id || typeof device_id !== 'string') {
    throw new Error('device_id is required and must be a non-empty string');
  }
  if (!product || typeof product !== 'string') {
    throw new Error('product is required and must be a non-empty string');
  }

  let planQuery, planValues;

  if (plan_name) {
    planQuery = `
      SELECT plan_id, product, plan_name, amount_paise, billing_cycle_days
      FROM plans WHERE product = $1 AND plan_name = $2 AND is_active = true LIMIT 1
    `;
    planValues = [product, plan_name];
  } else {
    planQuery = `
      SELECT plan_id, product, plan_name, amount_paise, billing_cycle_days
      FROM plans WHERE product = $1 AND is_active = true ORDER BY created_at ASC LIMIT 1
    `;
    planValues = [product];
  }

  const planResult = await pool.query(planQuery, planValues);
  if (planResult.rows.length === 0) {
    throw new Error(`No active plan found for product: ${product}${plan_name ? `, plan: ${plan_name}` : ''}`);
  }

  const plan = planResult.rows[0];

  const insertQuery = `
    INSERT INTO subscriptions (
      device_id, product, plan_name, status,
      amount_paise, billing_cycle_days, trial_end_date
    ) VALUES ($1, $2, $3, 'trial', $4, $5, NOW() + INTERVAL '7 days')
    RETURNING *
  `;

  const result = await pool.query(insertQuery, [
    device_id, product, plan.plan_name, plan.amount_paise, plan.billing_cycle_days,
  ]);

  return result.rows[0];
}

export async function checkAccess({ device_id, product }) {
  const pool = getPool();

  if (!device_id) throw new Error('device_id is required');
  if (!product) throw new Error('product is required');

  const result = await pool.query(
    `SELECT subscription_id, status, trial_end_date, expires_at
     FROM subscriptions WHERE device_id = $1 AND product = $2 LIMIT 1`,
    [device_id, product]
  );

  if (result.rows.length === 0) {
    return { status: 'inactive', subscription_id: null, expires_at: null };
  }

  const sub = result.rows[0];

  if (sub.status === 'trial' && sub.trial_end_date && new Date(sub.trial_end_date) > new Date()) {
    return { status: 'active', subscription_id: sub.subscription_id, expires_at: sub.trial_end_date };
  }

  if (sub.status === 'active' && (sub.expires_at === null || new Date(sub.expires_at) > new Date())) {
    return { status: 'active', subscription_id: sub.subscription_id, expires_at: sub.expires_at };
  }

  return { status: 'inactive', subscription_id: sub.subscription_id, expires_at: sub.expires_at };
}

export async function activateSubscription({ subscription_id, razorpay_payment_id, paid_at, billing_cycle_days }) {
  const pool = getPool();

  if (!subscription_id) throw new Error('subscription_id is required');
  if (!razorpay_payment_id) throw new Error('razorpay_payment_id is required');
  if (!billing_cycle_days || billing_cycle_days < 1) throw new Error('billing_cycle_days must be a positive integer');

  const query = `
    UPDATE subscriptions
    SET status = 'active', paid_at = $1, razorpay_payment_id = $2,
        expires_at = $1::timestamptz + ($4 || ' days')::interval
    WHERE subscription_id = $3
    RETURNING *
  `;

  const result = await pool.query(query, [paid_at, razorpay_payment_id, subscription_id, billing_cycle_days.toString()]);
  if (result.rows.length === 0) throw new Error(`Subscription not found: ${subscription_id}`);
  return result.rows[0];
}
