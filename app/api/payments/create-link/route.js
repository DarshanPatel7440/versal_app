import { createSubscriptionPaymentLink } from '@/lib/payment-service';

export async function POST(request) {
  try {
    const { subscription_id, metadata } = await request.json();
    const result = await createSubscriptionPaymentLink({ subscription_id, metadata });
    return Response.json(result, { status: 201 });
  } catch (err) {
    if (err.statusCode === 404) return Response.json({ error: 'subscription_not_found' }, { status: 404 });
    if (err.statusCode === 400 || err.message?.includes('already active')) {
      return Response.json({ error: 'subscription_already_active' }, { status: 400 });
    }
    if (err.statusCode === 503 || err.statusCode === 429) {
      return Response.json({ error: 'payment_provider_unavailable' }, { status: 503 });
    }
    if (err.message?.includes('is required')) return Response.json({ error: err.message }, { status: 400 });
    console.error('POST /api/payments/create-link error:', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
