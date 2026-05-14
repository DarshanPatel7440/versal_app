import { checkAccess } from '@/lib/subscription-manager';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const device_id = searchParams.get('device_id');
    const product = searchParams.get('product');

    if (!device_id) return Response.json({ error: 'device_id parameter required' }, { status: 400 });
    if (!product) return Response.json({ error: 'product parameter required' }, { status: 400 });

    const result = await checkAccess({ device_id, product });
    return Response.json(result);
  } catch (err) {
    console.error('GET /api/subscriptions/access error:', err);
    return Response.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
