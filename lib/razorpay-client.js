import https from 'https';

const RAZORPAY_API_BASE = 'api.razorpay.com';
const PAYMENT_LINKS_PATH = '/v1/payment_links';

export function createPaymentLink({ amount_paise, currency, description, reference_id, expire_by, callback_url, metadata }) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials not configured');
  }

  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const body = {
    amount: amount_paise,
    currency: currency || 'INR',
    description: description || '',
    reference_id,
    expire_by,
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
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
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
            reject(err);
          } else {
            const err = new Error(parsed.error?.description || `Razorpay error: ${res.statusCode}`);
            err.statusCode = res.statusCode >= 500 ? 503 : 400;
            reject(err);
          }
        } catch (e) {
          const err = new Error('Failed to parse Razorpay response');
          err.statusCode = 503;
          reject(err);
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(Object.assign(new Error('Razorpay timeout'), { statusCode: 503 })); });
    req.on('error', (e) => { reject(Object.assign(new Error(`Razorpay request failed: ${e.message}`), { statusCode: 503 })); });
    req.write(payload);
    req.end();
  });
}
