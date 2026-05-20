import { getPool } from '@/lib/db';
import { createSubscriptionPaymentLink } from '@/lib/payment-service';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const pool = getPool();

  // Find subscriptions that need a renewal payment link:
  // 1. Active subscriptions expiring within 3 days (pre-expiry reminder)
  // 2. Already expired subscriptions that don't have a valid link yet (keep generating daily until they pay)
  const result = await pool.query(`
    SELECT subscription_id FROM subscriptions
    WHERE (payment_link_expires_at IS NULL OR payment_link_expires_at < NOW())
      AND (
        (status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW() + INTERVAL '3 days' AND expires_at > NOW())
        OR
        (status = 'expired' AND expires_at IS NOT NULL AND expires_at < NOW())
      )
  `);

  const results = { generated: 0, failed: 0, errors: [] };

  for (const row of result.rows) {
    try {
      await createSubscriptionPaymentLink({
        subscription_id: row.subscription_id,
        metadata: { reason: 'auto_renewal' },
      });
      results.generated++;
    } catch (err) {
      results.failed++;
      results.errors.push({ subscription_id: row.subscription_id, error: err.message });
      console.error(`Failed to generate renewal link for ${row.subscription_id}:`, err.message);
    }
  }

  return Response.json({
    subscriptions_found: result.rows.length,
    links_generated: results.generated,
    links_failed: results.failed,
    errors: results.errors,
  });
}
