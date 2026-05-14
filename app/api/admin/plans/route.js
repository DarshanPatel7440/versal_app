import { getPool } from '@/lib/db';

export async function GET() {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM plans ORDER BY product, plan_name');
    return Response.json(result.rows);
  } catch (err) {
    console.error('GET /api/admin/plans error:', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const pool = getPool();
    const { product, plan_name, amount_paise, billing_cycle_days, description } = await request.json();

    if (!product || typeof product !== 'string') {
      return Response.json({ error: 'product is required' }, { status: 400 });
    }
    if (!plan_name || typeof plan_name !== 'string') {
      return Response.json({ error: 'plan_name is required' }, { status: 400 });
    }
    if (!amount_paise || typeof amount_paise !== 'number' || amount_paise <= 0) {
      return Response.json({ error: 'amount_paise must be a positive number' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO plans (product, plan_name, amount_paise, billing_cycle_days, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [product, plan_name, amount_paise, billing_cycle_days || 30, description || null]
    );

    return Response.json(result.rows[0], { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/plans error:', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
