'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get('razorpay_payment_id') || searchParams.get('payment_id') || '—';
  const amount = searchParams.get('amount');
  const amountDisplay = amount ? `₹${(parseInt(amount, 10) / 100).toFixed(2)}` : '—';

  return (
    <div style={styles.body}>
      <div style={styles.card}>
        <div style={styles.successIcon}>
          <svg viewBox="0 0 24 24" width="40" height="40" stroke="#fff" strokeWidth="3" fill="none">
            <polyline points="6 12 10 16 18 8" />
          </svg>
        </div>

        <h1 style={styles.h1}>Payment Successful!</h1>
        <p style={styles.message}>
          Your payment has been processed successfully. Your subscription is now active.
        </p>

        <div style={styles.details}>
          <div style={styles.row}>
            <span style={styles.label}>Status</span>
            <span style={styles.badge}>Paid</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Transaction ID</span>
            <span style={styles.value}>{paymentId}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Amount</span>
            <span style={styles.value}>{amountDisplay}</span>
          </div>
        </div>

        <a href="https://www.mobiofficehq.com/" style={styles.btn}>
          Done — Go to Home
        </a>

        <p style={styles.footer}>Thank you for choosing MobiOffice</p>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div style={styles.body}><p>Loading...</p></div>}>
      <PaymentSuccessContent />
    </Suspense>
  );
}

const styles = {
  body: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    margin: 0,
  },
  card: {
    background: '#ffffff',
    borderRadius: '20px',
    padding: '48px 40px',
    maxWidth: '440px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  successIcon: {
    width: '80px',
    height: '80px',
    background: '#4caf50',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
  },
  h1: {
    fontSize: '26px',
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: '12px',
  },
  message: {
    fontSize: '16px',
    color: '#555',
    lineHeight: 1.6,
    marginBottom: '32px',
  },
  details: {
    background: '#f8f9fa',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '32px',
    textAlign: 'left',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #eee',
  },
  label: { fontSize: '14px', color: '#777' },
  value: { fontSize: '14px', fontWeight: 600, color: '#333' },
  badge: {
    background: '#e8f5e9',
    color: '#2e7d32',
    fontSize: '12px',
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: '20px',
  },
  btn: {
    display: 'block',
    width: '100%',
    padding: '16px 32px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '12px',
    textDecoration: 'none',
    textAlign: 'center',
  },
  footer: {
    marginTop: '20px',
    fontSize: '13px',
    color: '#999',
  },
};
