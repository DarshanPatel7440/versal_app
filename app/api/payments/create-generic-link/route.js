import { createGenericPaymentLink } from '@/lib/payment-service';

export async function POST(request) {
  try {
    const { amount_paise, description, reference_id, metadata, callback_url } = await request.json();
    const result = await createGenericPaymentLink({ amount_paise, description, reference_id, metadata, callback_url });
    return Response.json(result, { status: 201 });
  } catch (err) {
    if (err.statusCode === 503 || err.statusCode === 429) {
      return Response.json({ error: 'payment_provider_unavailable' }, { status: 503 });
    }
    if (err.message?.includes('is required')) return Response.json({ error: err.message }, { status: 400 });
    console.error('POST /api/payments/create-generic-link error:', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
