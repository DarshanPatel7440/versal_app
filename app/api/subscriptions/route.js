import { createTrialSubscription } from '@/lib/subscription-manager';

export async function POST(request) {
  try {
    const { device_id, product, plan_name } = await request.json();
    const subscription = await createTrialSubscription({ device_id, product, plan_name });
    return Response.json(subscription, { status: 201 });
  } catch (err) {
    if (err.message?.includes('is required') || err.message?.includes('No active plan found')) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error('POST /api/subscriptions error:', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
