# Global Payment Service

Centralized payment and subscription management service for Talk2Tally. Handles trial subscriptions, Razorpay payment link creation, webhook processing, and subscription lifecycle management.

## Overview

This service provides:

- **Trial Subscriptions** — Automatic 7-day trial creation per device/product
- **Payment Links** — Razorpay payment link generation with 24-hour expiry
- **Webhook Processing** — Secure Razorpay webhook handling with signature verification
- **Access Control** — Real-time subscription status checks for other services
- **Expiry Management** — Background worker that expires stale trials and payment links

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ with `pgcrypto` extension enabled
- Razorpay account (test or live keys)

### Installation

```bash
npm install
```

### Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay API Key Secret |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay Webhook Secret |
| `PORT` | Service port (default: 8590) |
| `NODE_ENV` | Environment (development/production) |

### Run Migrations

```bash
npm run migrate
```

This reads all `.sql` files from the `migrations/` folder and executes them in order.

### Start the Service

```bash
npm start
```

For production with PM2:

```bash
npx pm2 start ecosystem.config.js
```

### Run Tests

```bash
npm test
```

## API Documentation

### Health Check

```
GET /health
```

Response:
```json
{ "status": "ok", "service": "global-payment-service" }
```

### Subscriptions

#### Create Trial Subscription

```
POST /subscriptions
Content-Type: application/json

{
  "device_id": "device-uuid-here",
  "product": "talk2tally",
  "plan_name": "monthly"  // optional, defaults to first active plan
}
```

Response (201):
```json
{
  "subscription_id": "uuid",
  "device_id": "device-uuid-here",
  "product": "talk2tally",
  "plan_name": "monthly",
  "status": "trial",
  "amount_paise": 100000,
  "billing_cycle_days": 30,
  "trial_end_date": "2024-01-22T00:00:00.000Z"
}
```

#### Check Access

```
GET /subscriptions/access?device_id=device-uuid&product=talk2tally
```

Response:
```json
{
  "status": "active",
  "subscription_id": "uuid",
  "expires_at": "2024-01-22T00:00:00.000Z"
}
```

Status values: `active` (trial or paid with valid expiry) or `inactive` (expired, cancelled, or no subscription).

### Payments

#### Create Payment Link (for subscription)

```
POST /payments/create-link
Content-Type: application/json

{
  "subscription_id": "uuid",
  "metadata": {}  // optional
}
```

Response (201):
```json
{
  "payment_link_url": "https://rzp.io/i/xxxxx",
  "payment_link_id": "plink_xxxxx",
  "expires_at": "2024-01-16T00:00:00.000Z"
}
```

#### Create Generic Payment Link

```
POST /payments/create-generic-link
Content-Type: application/json

{
  "amount_paise": 100000,
  "description": "Payment description",
  "reference_id": "unique-reference",
  "metadata": { "payment_type": "recharge" },
  "callback_url": "https://example.com/callback"  // optional
}
```

Response (201):
```json
{
  "payment_link_url": "https://rzp.io/i/xxxxx",
  "payment_link_id": "plink_xxxxx",
  "expires_at": "2024-01-16T00:00:00.000Z"
}
```

### Webhooks

#### Razorpay Webhook

```
POST /webhook/razorpay
X-Razorpay-Signature: <hmac-sha256-signature>
Content-Type: application/json

{ ... razorpay webhook payload ... }
```

Processes `payment_link.paid` events. Verifies signature, activates subscription, and marks payment as captured.

## Integration Guide

Other services interact with this service via HTTP. Example from an Edge Agent or WhatsApp bridge:

### Check if a device has active access

```javascript
const response = await fetch(
  `http://payment-service:8590/subscriptions/access?device_id=${deviceId}&product=talk2tally`
);
const { status } = await response.json();

if (status === 'active') {
  // Allow access
} else {
  // Prompt for subscription/payment
}
```

### Create a trial for a new device

```javascript
const response = await fetch('http://payment-service:8590/subscriptions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ device_id: deviceId, product: 'talk2tally' }),
});
const subscription = await response.json();
```

### Generate a payment link

```javascript
const response = await fetch('http://payment-service:8590/payments/create-link', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ subscription_id: subscriptionId }),
});
const { payment_link_url } = await response.json();
// Send payment_link_url to the user
```

## Deployment Notes

### Docker

```bash
docker build -t global-payment-service .
docker run -p 8590:8590 --env-file .env global-payment-service
```

### PM2 (EC2/VPS)

```bash
npx pm2 start ecosystem.config.js
npx pm2 save
npx pm2 startup
```

### Razorpay Webhook Setup

1. Go to Razorpay Dashboard → Settings → Webhooks
2. Add webhook URL: `https://your-domain.com/webhook/razorpay`
3. Select event: `payment_link.paid`
4. Copy the webhook secret to your `.env` as `RAZORPAY_WEBHOOK_SECRET`

### Database

The service expects a PostgreSQL database with the `pgcrypto` extension enabled and a `subscriptions` table already present. Run `npm run migrate` to apply the payment schema extensions.

### Nginx (reverse proxy)

```nginx
location /payment/ {
    proxy_pass http://127.0.0.1:8590/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
