'use client';

import { useState, useEffect } from 'react';

export default function HomePage() {
  const [health, setHealth] = useState(null);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: 'error' }));

    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const endpoints = [
    { method: 'GET', path: '/api/health', desc: 'Service health check' },
    { method: 'POST', path: '/api/subscriptions', desc: 'Create trial subscription' },
    { method: 'GET', path: '/api/subscriptions/access', desc: 'Check subscription access' },
    { method: 'POST', path: '/api/payments/create-link', desc: 'Generate payment link' },
    { method: 'POST', path: '/api/payments/create-generic-link', desc: 'Generic payment link' },
    { method: 'POST', path: '/api/webhook/razorpay', desc: 'Razorpay webhook handler' },
    { method: 'GET', path: '/admin', desc: 'Plan management dashboard' },
  ];

  const statusColor = health?.status === 'ok' ? '#00e676' : health?.status === 'error' ? '#ff1744' : '#ffc107';
  const statusText = health?.status === 'ok' ? 'Operational' : health?.status === 'error' ? 'Degraded' : 'Checking...';

  return (
    <div style={styles.page}>
      {/* Animated background orbs */}
      <div style={styles.orbContainer}>
        <div style={{ ...styles.orb, ...styles.orb1 }} />
        <div style={{ ...styles.orb, ...styles.orb2 }} />
        <div style={{ ...styles.orb, ...styles.orb3 }} />
      </div>

      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.logoRow}>
            <div style={styles.logo}>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <div>
              <h1 style={styles.title}>Global Payment Service</h1>
              <p style={styles.subtitle}>MobiOffice Billing & Subscription Engine</p>
            </div>
          </div>
          <div style={styles.clock}>{time.toLocaleTimeString('en-IN', { hour12: true })}</div>
        </header>

        {/* Status Card */}
        <div style={styles.statusCard}>
          <div style={styles.statusRow}>
            <div style={styles.statusLeft}>
              <div style={{ ...styles.statusDot, background: statusColor, boxShadow: `0 0 12px ${statusColor}` }} />
              <div>
                <p style={styles.statusLabel}>System Status</p>
                <p style={{ ...styles.statusValue, color: statusColor }}>{statusText}</p>
              </div>
            </div>
            <div style={styles.statusRight}>
              <div style={styles.statBox}>
                <p style={styles.statLabel}>Service</p>
                <p style={styles.statValue}>{health?.service || '—'}</p>
              </div>
              <div style={styles.statBox}>
                <p style={styles.statLabel}>Gateway</p>
                <p style={styles.statValue}>Razorpay</p>
              </div>
              <div style={styles.statBox}>
                <p style={styles.statLabel}>Currency</p>
                <p style={styles.statValue}>INR (₹)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Grid: Endpoints + Quick Actions */}
        <div style={styles.grid}>
          {/* API Endpoints */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              API Endpoints
            </h2>
            <div style={styles.endpointList}>
              {endpoints.map((ep, i) => (
                <div key={i} style={styles.endpoint}>
                  <span style={{
                    ...styles.method,
                    background: ep.method === 'GET' ? 'rgba(0, 230, 118, 0.15)' : 'rgba(102, 126, 234, 0.15)',
                    color: ep.method === 'GET' ? '#00e676' : '#667eea',
                  }}>
                    {ep.method}
                  </span>
                  <code style={styles.path}>{ep.path}</code>
                  <span style={styles.desc}>{ep.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div style={styles.actionsCol}>
            <a href="/admin" style={styles.actionCard}>
              <div style={{ ...styles.actionIcon, background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <div>
                <p style={styles.actionTitle}>Plan Manager</p>
                <p style={styles.actionDesc}>Create and manage subscription plans</p>
              </div>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </a>

            <a href="/api/health" style={styles.actionCard}>
              <div style={{ ...styles.actionIcon, background: 'linear-gradient(135deg, #00e676, #00c853)' }}>
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <div>
                <p style={styles.actionTitle}>Health Check</p>
                <p style={styles.actionDesc}>View raw API health response</p>
              </div>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </a>

            <div style={styles.infoCard}>
              <h3 style={styles.infoTitle}>Integration Guide</h3>
              <p style={styles.infoText}>
                Use the API endpoints to integrate payments into your MobiOffice products. 
                Start by creating a subscription, then generate a payment link for the user.
              </p>
              <div style={styles.flowSteps}>
                <div style={styles.flowStep}><span style={styles.flowNum}>1</span> Create Subscription</div>
                <div style={styles.flowArrow}>→</div>
                <div style={styles.flowStep}><span style={styles.flowNum}>2</span> Generate Link</div>
                <div style={styles.flowArrow}>→</div>
                <div style={styles.flowStep}><span style={styles.flowNum}>3</span> Receive Webhook</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer style={styles.footer}>
          <p>© {new Date().getFullYear()} MobiOffice · Global Payment Service v1.0.0</p>
        </footer>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { margin: 0; }
        @keyframes float1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,-40px) scale(1.1); } }
        @keyframes float2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-40px,30px) scale(0.9); } }
        @keyframes float3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(20px,40px) scale(1.05); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: '#0a0a1a',
    minHeight: '100vh',
    color: '#e0e0e0',
    position: 'relative',
    overflow: 'hidden',
  },
  orbContainer: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 },
  orb: { position: 'absolute', borderRadius: '50%', filter: 'blur(80px)', opacity: 0.3 },
  orb1: { width: 400, height: 400, background: '#667eea', top: '-10%', right: '-5%', animation: 'float1 8s ease-in-out infinite' },
  orb2: { width: 300, height: 300, background: '#764ba2', bottom: '10%', left: '-5%', animation: 'float2 10s ease-in-out infinite' },
  orb3: { width: 200, height: 200, background: '#00e676', top: '50%', left: '50%', animation: 'float3 12s ease-in-out infinite' },

  container: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px', position: 'relative', zIndex: 1 },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 16 },
  logoRow: { display: 'flex', alignItems: 'center', gap: 16 },
  logo: {
    width: 52, height: 52, borderRadius: 14,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 20px rgba(102, 126, 234, 0.4)',
  },
  title: { fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' },
  subtitle: { fontSize: 14, color: '#888', marginTop: 2 },
  clock: { fontSize: 14, color: '#666', fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '8px 16px', borderRadius: 8 },

  statusCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16, padding: '24px 28px', marginBottom: 28,
    backdropFilter: 'blur(20px)',
  },
  statusRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 },
  statusLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  statusDot: { width: 14, height: 14, borderRadius: '50%', animation: 'pulse 2s ease-in-out infinite' },
  statusLabel: { fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 },
  statusValue: { fontSize: 18, fontWeight: 700, marginTop: 2 },
  statusRight: { display: 'flex', gap: 24, flexWrap: 'wrap' },
  statBox: { textAlign: 'center' },
  statLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 },
  statValue: { fontSize: 14, fontWeight: 600, color: '#ccc', marginTop: 4 },

  grid: { display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, alignItems: 'start' },

  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16, padding: 28,
    backdropFilter: 'blur(20px)',
  },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 20, display: 'flex', alignItems: 'center' },
  endpointList: { display: 'flex', flexDirection: 'column', gap: 10 },
  endpoint: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
    borderRadius: 10, background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.05)',
    transition: 'background 0.2s',
    flexWrap: 'wrap',
  },
  method: { fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, letterSpacing: 0.5, flexShrink: 0 },
  path: { fontSize: 13, color: '#ccc', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 },
  desc: { fontSize: 12, color: '#666', marginLeft: 'auto' },

  actionsCol: { display: 'flex', flexDirection: 'column', gap: 16 },
  actionCard: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, textDecoration: 'none', color: 'inherit',
    transition: 'all 0.2s',
    backdropFilter: 'blur(20px)',
    cursor: 'pointer',
  },
  actionIcon: { width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionTitle: { fontSize: 14, fontWeight: 600, color: '#fff' },
  actionDesc: { fontSize: 12, color: '#888', marginTop: 2 },

  infoCard: {
    background: 'rgba(102, 126, 234, 0.08)',
    border: '1px solid rgba(102, 126, 234, 0.2)',
    borderRadius: 14, padding: 22,
  },
  infoTitle: { fontSize: 14, fontWeight: 700, color: '#667eea', marginBottom: 8 },
  infoText: { fontSize: 13, color: '#999', lineHeight: 1.6, marginBottom: 16 },
  flowSteps: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  flowStep: {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#ccc',
    background: 'rgba(255,255,255,0.06)', padding: '6px 12px', borderRadius: 8,
  },
  flowNum: {
    width: 22, height: 22, borderRadius: '50%',
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    color: '#fff', fontSize: 11, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  flowArrow: { color: '#555', fontSize: 16 },

  footer: { textAlign: 'center', marginTop: 48, fontSize: 13, color: '#444' },
};
