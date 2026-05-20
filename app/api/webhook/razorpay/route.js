import { verifySignature, extractPaymentEvent, processPaymentEvent } from '@/lib/webhook-handler';

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-razorpay-signature');
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Skip signature verification if no secret is configured
    if (webhookSecret && webhookSecret.length > 0 && !verifySignature(rawBody, signature, webhookSecret)) {
      return Response.json({ error: 'invalid_signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = extractPaymentEvent(payload);

    if (!event) {
      return Response.json({ status: 'ignored' });
    }

    await processPaymentEvent({
      subscription_id: event.subscription_id,
      razorpay_payment_id: event.razorpay_payment_id,
      amount_paise: event.amount_paise,
      paid_at: new Date(),
    });

    return Response.json({ status: 'processed' });
  } catch (err) {
    console.error('POST /api/webhook/razorpay error:', err);
    return Response.json({ status: 'error', message: 'processing_failed' });
  }
}
