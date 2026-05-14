'use strict';

/**
 * Expiry Worker
 *
 * Periodically checks for expired subscriptions and payment links,
 * transitioning them to 'expired' status.
 */

/**
 * Expire subscriptions that have passed their trial or active period.
 * Transitions to 'expired' for:
 * - Trial subscriptions with past trial_end_date and no payment
 * - Active subscriptions with past expires_at
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @returns {Promise<number>} Count of expired subscriptions
 */
async function expireSubscriptions(pool) {
  const query = `
    UPDATE subscriptions
    SET status = 'expired'
    WHERE
      (status = 'trial' AND trial_end_date < NOW() AND razorpay_payment_id IS NULL)
      OR (status = 'active' AND expires_at < NOW())
    RETURNING subscription_id
  `;

  const result = await pool.query(query);
  const count = result.rowCount;

  if (count > 0) {
    console.log(`[expiry-worker] Expired ${count} subscription(s)`);
  }

  return count;
}

/**
 * Expire payment links that have passed their expiry time.
 * Transitions pending payments with past expires_at to 'expired'.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @returns {Promise<number>} Count of expired payment records
 */
async function expirePaymentLinks(pool) {
  const query = `
    UPDATE payments
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < NOW()
    RETURNING payment_id
  `;

  const result = await pool.query(query);
  const count = result.rowCount;

  if (count > 0) {
    console.log(`[expiry-worker] Expired ${count} payment link(s)`);
  }

  return count;
}

/**
 * Start the expiry worker that periodically checks for expired
 * subscriptions and payment links.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {number} [intervalMs=3600000] - Interval in milliseconds (default: 1 hour)
 * @returns {NodeJS.Timeout} Interval handle (can be cleared for testing)
 */
function startExpiryWorker(pool, intervalMs = 3600000) {
  async function runExpiry() {
    try {
      await expireSubscriptions(pool);
      await expirePaymentLinks(pool);
    } catch (err) {
      console.error('[expiry-worker] Error during expiry check:', err.message);
    }
  }

  // Run immediately on start
  runExpiry();

  // Schedule periodic runs
  const handle = setInterval(runExpiry, intervalMs);
  return handle;
}

module.exports = {
  expireSubscriptions,
  expirePaymentLinks,
  startExpiryWorker,
};
