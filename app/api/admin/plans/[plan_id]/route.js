import { getPool } from '@/lib/db';

export async function PATCH(request, { params }) {
  try {
    const pool = getPool();
    const { plan_id } = params;
    const { is_active } = await request.json();

    const result = await pool.query(
      'UPDATE plans SET is_active = $1 WHERE plan_id = $2 RETURNING *',
      [is_active, plan_id]
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'plan_not_found' }, { status: 404 });
    }

    return Response.json(result.rows[0]);
  } catch (err) {
    console.error('PATCH /api/admin/plans/[plan_id] error:', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const pool = getPool();
    const { plan_id } = params;

    const result = await pool.query(
      'DELETE FROM plans WHERE plan_id = $1 RETURNING *',
      [plan_id]
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'plan_not_found' }, { status: 404 });
    }

    return Response.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/admin/plans/[plan_id] error:', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
