'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const { createRazorpayClient } = require('./razorpay-client');
const { createTrialSubscription, checkAccess } = require('./subscription-manager');
const { createSubscriptionPaymentLink, createGenericPaymentLink } = require('./payment-service');
const { verifySignature, extractPaymentEvent, processPaymentEvent } = require('./webhook-handler');

/**
 * Creates the Express application for the Razorpay Payment Service.
 *
 * @param {object} options
 * @param {import('pg').Pool} options.pool - PostgreSQL connection pool
 * @param {object} options.razorpayConfig - Razorpay credentials
 * @param {string} options.razorpayConfig.keyId - Razorpay Key ID
 * @param {string} options.razorpayConfig.keySecret - Razorpay Key Secret
 * @param {string} options.razorpayConfig.webhookSecret - Razorpay Webhook Secret
 * @param {object} [options.deps] - Optional dependency overrides for testing
 * @param {object} [options.deps.razorpayClient] - Override RazorpayClient instance
 * @returns {import('express').Application}
 */
function createApp(options = {}) {
  const { pool, razorpayConfig, deps } = options;

  // Create RazorpayClient instance (or use injected one for testing)
  const razorpayClient = (deps && deps.razorpayClient) ||
    (razorpayConfig ? createRazorpayClient(razorpayConfig) : null);

  const app = express();
  app.use(cors());

  // Serve static files (payment success UI, etc.)
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Parse JSON with rawBody capture for webhook signature verification
  app.use(express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }));

  // GET /health
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'global-payment-service' });
  });

  // GET /payment-success — Payment success UI page
  app.get('/payment-success', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'payment-success.html'));
  });

  // ─── Subscription Endpoints ───────────────────────────────────────────────────

  // POST /subscriptions — Create a trial subscription
  app.post('/subscriptions', async (req, res) => {
    try {
      const { device_id, product, plan_name } = req.body;
      const subscription = await createTrialSubscription(pool, { device_id, product, plan_name });
      res.status(201).json(subscription);
    } catch (err) {
      if (err.message && err.message.includes('is required')) {
        return res.status(400).json({ error: err.message });
      }
      if (err.message && err.message.includes('No active plan found')) {
        return res.status(400).json({ error: err.message });
      }
      console.error('POST /subscriptions error:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /subscriptions/access — Check access for a device/product
  app.get('/subscriptions/access', async (req, res) => {
    try {
      const { device_id, product } = req.query;

      if (!device_id) {
        return res.status(400).json({ error: 'device_id parameter required' });
      }
      if (!product) {
        return res.status(400).json({ error: 'product parameter required' });
      }

      const result = await checkAccess(pool, { device_id, product });
      res.json(result);
    } catch (err) {
      console.error('GET /subscriptions/access error:', err);
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  // ─── Payment Link Endpoints ───────────────────────────────────────────────────

  // POST /payments/create-link — Create a payment link for a subscription
  app.post('/payments/create-link', async (req, res) => {
    try {
      const { subscription_id, metadata } = req.body;
      const result = await createSubscriptionPaymentLink(pool, razorpayClient, {
        subscription_id,
        metadata,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).json({ error: 'subscription_not_found' });
      }
      if (err.statusCode === 400 || (err.message && err.message.includes('already active'))) {
        return res.status(400).json({ error: 'subscription_already_active' });
      }
      if (err.statusCode === 503 || err.statusCode === 429) {
        return res.status(503).json({ error: 'payment_provider_unavailable' });
      }
      if (err.message && err.message.includes('is required')) {
        return res.status(400).json({ error: err.message });
      }
      console.error('POST /payments/create-link error:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /payments/create-generic-link — Create a generic payment link
  app.post('/payments/create-generic-link', async (req, res) => {
    try {
      const { amount_paise, description, reference_id, metadata, callback_url } = req.body;
      const result = await createGenericPaymentLink(pool, razorpayClient, {
        amount_paise,
        description,
        reference_id,
        metadata,
        callback_url,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err.statusCode === 503 || err.statusCode === 429) {
        return res.status(503).json({ error: 'payment_provider_unavailable' });
      }
      if (err.message && err.message.includes('is required')) {
        return res.status(400).json({ error: err.message });
      }
      console.error('POST /payments/create-generic-link error:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // ─── Admin Endpoints (Plan Management) ──────────────────────────────────────

  // GET /admin/plans — List all plans
  app.get('/admin/plans', async (_req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM plans ORDER BY product, plan_name'
      );
      res.json(result.rows);
    } catch (err) {
      console.error('GET /admin/plans error:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /admin/plans — Add a new plan
  app.post('/admin/plans', async (req, res) => {
    try {
      const { product, plan_name, amount_paise, billing_cycle_days, description } = req.body;

      if (!product || typeof product !== 'string') {
        return res.status(400).json({ error: 'product is required' });
      }
      if (!plan_name || typeof plan_name !== 'string') {
        return res.status(400).json({ error: 'plan_name is required' });
      }
      if (!amount_paise || typeof amount_paise !== 'number' || amount_paise <= 0) {
        return res.status(400).json({ error: 'amount_paise must be a positive number' });
      }

      const result = await pool.query(
        `INSERT INTO plans (product, plan_name, amount_paise, billing_cycle_days, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [product, plan_name, amount_paise, billing_cycle_days || 30, description || null]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('POST /admin/plans error:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // PATCH /admin/plans/:plan_id — Update a plan (activate/deactivate)
  app.patch('/admin/plans/:plan_id', async (req, res) => {
    try {
      const { plan_id } = req.params;
      const { is_active } = req.body;

      const result = await pool.query(
        'UPDATE plans SET is_active = $1 WHERE plan_id = $2 RETURNING *',
        [is_active, plan_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'plan_not_found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('PATCH /admin/plans error:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // DELETE /admin/plans/:plan_id — Delete a plan
  app.delete('/admin/plans/:plan_id', async (req, res) => {
    try {
      const { plan_id } = req.params;

      const result = await pool.query(
        'DELETE FROM plans WHERE plan_id = $1 RETURNING *',
        [plan_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'plan_not_found' });
      }

      res.json({ deleted: true });
    } catch (err) {
      console.error('DELETE /admin/plans error:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // ─── Webhook Endpoint ─────────────────────────────────────────────────────────

  // POST /webhook/razorpay — Process Razorpay webhook events
  app.post('/webhook/razorpay', async (req, res) => {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const webhookSecret = razorpayConfig && razorpayConfig.webhookSecret;

      // Verify signature
      if (!verifySignature(req.rawBody, signature, webhookSecret)) {
        return res.status(401).json({ error: 'invalid_signature' });
      }

      // Extract payment event
      const event = extractPaymentEvent(req.body);
      if (!event) {
        // Not a payment_link.paid event or malformed — respond 200 to prevent retries
        return res.status(200).json({ status: 'ignored' });
      }

      // Process payment event
      await processPaymentEvent(pool, {
        subscription_id: event.subscription_id,
        razorpay_payment_id: event.razorpay_payment_id,
        amount_paise: event.amount_paise,
        paid_at: new Date(),
      });

      res.status(200).json({ status: 'processed' });
    } catch (err) {
      console.error('POST /webhook/razorpay error:', err);
      // Return 200 for all valid payloads to prevent Razorpay retries
      res.status(200).json({ status: 'error', message: 'processing_failed' });
    }
  });

  return app;
}

module.exports = { createApp };
