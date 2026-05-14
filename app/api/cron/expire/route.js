import { getPool } from '@/lib/db';

export async function GET(request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const pool = getPool();

  // Expire trial subscriptions
  const expiredSubs = await pool.query(`
    UPDATE subscriptions SET status = 'expired'
    WHERE (status = 'trial' AND trial_end_date < NOW() AND razorpay_payment_id IS NULL)
       OR (status = 'active' AND expires_at < NOW())
    RETURNING subscription_id
  `);

  // Expire pending payment links
  const expiredPayments = await pool.query(`
    UPDATE payments SET status = 'expired'
    WHERE status = 'pending' AND expires_at < NOW()
    RETURNING payment_id
  `);

  return Response.json({
    expired_subscriptions: expiredSubs.rowCount,
    expired_payments: expiredPayments.rowCount,
  });
}
