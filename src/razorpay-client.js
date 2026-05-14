'use strict';

const https = require('https');

/**
 * Razorpay Payment Links API Client
 *
 * Uses direct HTTPS calls (not the razorpay npm package) for full control
 * over error handling, timeouts, and response parsing.
 */

const RAZORPAY_API_BASE = 'api.razorpay.com';
const PAYMENT_LINKS_PATH = '/v1/payment_links';
const DEFAULT_TIMEOUT_MS = 10000; // 10 seconds

class RazorpayClient {
  /**
   * @param {object} config
   * @param {string} config.keyId - Razorpay Key ID
   * @param {string} config.keySecret - Razorpay Key Secret
   * @param {number} [config.timeoutMs] - Request timeout in milliseconds
   */
  constructor({ keyId, keySecret, timeoutMs }) {
    if (!keyId || typeof keyId !== 'string') {
      throw new Error('keyId is required and must be a non-empty string');
    }
    if (!keySecret || typeof keySecret !== 'string') {
      throw new Error('keySecret is required and must be a non-empty string');
    }
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.timeoutMs = timeoutMs || DEFAULT_TIMEOUT_MS;
    this.authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  }

  /**
   * Create a Razorpay Payment Link.
   *
   * @param {object} params
   * @param {number} params.amount_paise - Amount in paise (e.g., 100000 = ₹1,000)
   * @param {string} [params.currency] - Currency code (default: "INR")
   * @param {string} params.description - Payment description
   * @param {string} params.reference_id - Unique reference (subscription_id)
   * @param {number} [params.expire_by] - Unix timestamp for link expiry
   * @param {string} [params.callback_url] - URL to redirect after payment
   * @param {object} [params.metadata] - Additional metadata (notes)
   * @returns {Promise<{payment_link_id: string, short_url: string, expire_by: number}>}
   */
  createPaymentLink({ amount_paise, currency, description, reference_id, expire_by, callback_url, metadata }) {
    const body = {
      amount: amount_paise,
      currency: currency || 'INR',
      description: description || '',
      reference_id: reference_id,
      expire_by: expire_by,
    };

    if (callback_url) {
      body.callback_url = callback_url;
      body.callback_method = 'get';
    }

    if (metadata && typeof metadata === 'object') {
      body.notes = metadata;
    }

    const payload = JSON.stringify(body);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: RAZORPAY_API_BASE,
        port: 443,
        path: PAYMENT_LINKS_PATH,
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: this.timeoutMs,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);

            if (res.statusCode === 200 || res.statusCode === 201) {
              resolve({
                payment_link_id: parsed.id,
                short_url: parsed.short_url,
                expire_by: parsed.expire_by,
              });
            } else if (res.statusCode === 429) {
              const err = new Error('Rate limited by Razorpay');
              err.statusCode = 429;
              err.razorpayError = parsed;
              reject(err);
            } else if (res.statusCode >= 400 && res.statusCode < 500) {
              const err = new Error(parsed.error?.description || `Razorpay API error: ${res.statusCode}`);
              err.statusCode = 400;
              err.razorpayError = parsed;
              reject(err);
            } else {
              // 5xx or unexpected status
              const err = new Error(parsed.error?.description || `Razorpay server error: ${res.statusCode}`);
              err.statusCode = 503;
              err.razorpayError = parsed;
              reject(err);
            }
          } catch (parseErr) {
            const err = new Error('Failed to parse Razorpay response');
            err.statusCode = 503;
            err.rawResponse = data;
            reject(err);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const err = new Error('Razorpay API request timed out');
        err.statusCode = 503;
        reject(err);
      });

      req.on('error', (e) => {
        const err = new Error(`Razorpay API request failed: ${e.message}`);
        err.statusCode = 503;
        err.cause = e;
        reject(err);
      });

      req.write(payload);
      req.end();
    });
  }
}

/**
 * Factory function to create a RazorpayClient instance.
 *
 * @param {object} config
 * @param {string} config.keyId - Razorpay Key ID
 * @param {string} config.keySecret - Razorpay Key Secret
 * @param {number} [config.timeoutMs] - Request timeout in milliseconds
 * @returns {RazorpayClient}
 */
function createRazorpayClient(config) {
  return new RazorpayClient(config);
}

module.exports = { RazorpayClient, createRazorpayClient };
