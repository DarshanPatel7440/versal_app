'use client';

import { useState, useEffect } from 'react';

export default function AdminPage() {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ product: '', plan_name: '', amount: '', billing_cycle: '30', description: '' });
  const [toast, setToast] = useState(null);

  useEffect(() => { loadPlans(); }, []);

  async function loadPlans() {
    const res = await fetch('/api/admin/plans');
    const data = await res.json();
    setPlans(data);
  }

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: form.product.trim().toLowerCase(),
          plan_name: form.plan_name.trim().toLowerCase(),
          amount_paise: parseInt(form.amount) * 100,
          billing_cycle_days: parseInt(form.billing_cycle),
          description: form.description.trim() || undefined,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
      showToast('Plan added successfully');
      setForm({ product: '', plan_name: '', amount: '', billing_cycle: '30', description: '' });
      loadPlans();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function togglePlan(planId, isActive) {
    await fetch(`/api/admin/plans/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: isActive }),
    });
    showToast(`Plan ${isActive ? 'activated' : 'deactivated'}`);
    loadPlans();
  }

  async function deletePlan(planId) {
    if (!confirm('Delete this plan?')) return;
    await fetch(`/api/admin/plans/${planId}`, { method: 'DELETE' });
    showToast('Plan deleted');
    loadPlans();
  }

  return (
    <div style={styles.body}>
      <div style={styles.container}>
        <h1 style={styles.h1}>Plan Management</h1>
        <p style={styles.subtitle}>Add and manage product plans and pricing</p>

        {/* Add Plan Form */}
        <div style={styles.card}>
          <h2 style={styles.h2}>Add New Plan</h2>
          <form onSubmit={handleSubmit}>
            <div style={styles.grid}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Product Name</label>
                <input style={styles.input} placeholder="e.g. tally, erp" required
                  value={form.product} onChange={e => setForm({...form, product: e.target.value})} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Plan Name</label>
                <input style={styles.input} placeholder="e.g. monthly, yearly" required
                  value={form.plan_name} onChange={e => setForm({...form, plan_name: e.target.value})} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Price (₹)</label>
                <input style={styles.input} type="number" placeholder="e.g. 1000" min="1" required
                  value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Billing Cycle (days)</label>
                <input style={styles.input} type="number" min="1" required
                  value={form.billing_cycle} onChange={e => setForm({...form, billing_cycle: e.target.value})} />
              </div>
              <div style={{...styles.formGroup, gridColumn: '1 / -1'}}>
                <label style={styles.label}>Description (optional)</label>
                <input style={styles.input} placeholder="e.g. Tally Monthly - ₹1,000/month"
                  value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>
            </div>
            <button type="submit" style={styles.btnAdd}>Add Plan</button>
          </form>
        </div>

        {/* Plans Table */}
        <div style={styles.card}>
          <h2 style={styles.h2}>Existing Plans</h2>
          {plans.length === 0 ? (
            <p style={styles.empty}>No plans yet. Add one above.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Plan</th>
                  <th style={styles.th}>Price</th>
                  <th style={styles.th}>Cycle</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map(p => (
                  <tr key={p.plan_id}>
                    <td style={styles.td}><strong>{p.product}</strong></td>
                    <td style={styles.td}>{p.plan_name}</td>
                    <td style={styles.td}>₹{(p.amount_paise / 100).toLocaleString()}</td>
                    <td style={styles.td}>{p.billing_cycle_days} days</td>
                    <td style={styles.td}>
                      <span style={p.is_active ? styles.badgeActive : styles.badgeInactive}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <button style={styles.btnToggle} onClick={() => togglePlan(p.plan_id, !p.is_active)}>
                        {p.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button style={styles.btnDelete} onClick={() => deletePlan(p.plan_id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {toast && (
        <div style={{...styles.toast, background: toast.type === 'error' ? '#e53935' : '#4caf50'}}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

const styles = {
  body: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: '#f0f2f5', minHeight: '100vh', padding: '24px', margin: 0 },
  container: { maxWidth: '900px', margin: '0 auto' },
  h1: { fontSize: '24px', color: '#1a1a2e', marginBottom: '8px' },
  h2: { fontSize: '18px', marginBottom: '20px', color: '#333' },
  subtitle: { color: '#666', marginBottom: '32px', fontSize: '14px' },
  card: { background: '#fff', borderRadius: '12px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '32px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  formGroup: { display: 'flex', flexDirection: 'column' },
  label: { fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '6px' },
  input: { padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none' },
  btnAdd: { marginTop: '20px', padding: '12px 28px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#888', textTransform: 'uppercase', padding: '10px 12px', borderBottom: '2px solid #f0f0f0' },
  td: { padding: '14px 12px', fontSize: '14px', color: '#333', borderBottom: '1px solid #f5f5f5' },
  badgeActive: { background: '#e8f5e9', color: '#2e7d32', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '12px' },
  badgeInactive: { background: '#fbe9e7', color: '#c62828', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '12px' },
  btnToggle: { padding: '6px 14px', border: '1px solid #ddd', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: 'pointer', marginRight: '6px' },
  btnDelete: { padding: '6px 14px', border: '1px solid #ffcdd2', borderRadius: '6px', background: '#fff', color: '#c62828', fontSize: '12px', cursor: 'pointer' },
  empty: { textAlign: 'center', padding: '40px', color: '#999' },
  toast: { position: 'fixed', bottom: '24px', right: '24px', padding: '14px 24px', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 500, zIndex: 1000 },
};
