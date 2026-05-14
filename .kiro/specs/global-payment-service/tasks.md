# Implementation Plan: Global Payment Service

## Overview

Build the `cloud/razorpay-service` microservice from scratch, extend the database schema with payment-related tables, integrate with the WhatsApp-NATS Bridge for access gating, and wire everything together with PM2 and Nginx. The implementation follows an incremental approach: database first, then core service logic, then integrations.

## Tasks

- [x] 1. Set up razorpay-service project structure and dependencies
  - [x] 1.1 Create `cloud/razorpay-service/package.json` with dependencies (express, cors, razorpay, pg, uuid, dotenv, node-cron) and devDependencies (jest, fast-check, nock, supertest)
    - Configure `"scripts": { "start": "node src/index.js", "test": "jest --forceExit" }`
    - Match Node.js engine requirement `>=18.0.0` consistent with other services
    - _Requirements: 4.1, 7.1_

  - [x] 1.2 Create `cloud/razorpay-service/src/index.js` entry point
    - Load dotenv, import createApp, connect to PostgreSQL pool (reuse DATABASE_URL from .env), start server on port 8590
    - Follow the same pattern as `cloud/onboarding-api/src/index.js`
    - _Requirements: 2.4_

  - [x] 1.3 Create `cloud/razorpay-service/src/server.js` with Express app skeleton
    - Implement `createApp(options)` factory function accepting pool, razorpay config, and optional dependencies for testing
    - Add `GET /health` endpoint returning `{ status: "ok", service: "razorpay-service" }`
    - Wire middleware: cors, express.json with rawBody capture (for webhook signature verification)
    - _Requirements: 5.1, 5.6_

- [x] 2. Database schema migration
  - [x] 2.1 Create `cloud/razorpay-service/migrations/001-payment-schema.sql`
    - ALTER subscriptions table to add: product, amount_paise, billing_cycle_days, trial_end_date, paid_at, razorpay_payment_id, payment_link_id, payment_link_url, payment_link_expires_at columns
    - Add unique index `idx_subscriptions_device_product` on (device_id, product)
    - Update status CHECK constraint to include 'trial'
    - Create `plans` table with: plan_id, product, plan_name, amount_paise, billing_cycle_days, description, is_active, created_at
    - Seed default Talk2Tally monthly plan (₹1,000 = 100000 paise, 30-day cycle)
    - Create `payments` table with: payment_id, subscription_id (FK), amount_paise, currency, status, payment_type, razorpay_link_id, razorpay_payment_id, reference_id, short_url, metadata (JSONB), created_at, paid_at, expires_at
    - Add indexes: idx_payments_reference_id, idx_payments_razorpay_payment_id (unique, partial)
    - _Requirements: 1.3, 4.4, 7.4, 8.1, 8.3, 10.1_

- [x] 3. Implement subscription management module
  - [x] 3.1 Create `cloud/razorpay-service/src/subscription-manager.js`
    - Implement `createTrialSubscription(pool, { device_id, product, plan_name })` — looks up plan from plans table, creates subscription with status "trial", trial_end_date = NOW() + 7 days, amount from plan
    - Implement `checkAccess(pool, { device_id, product })` — returns { status: "active"|"inactive", subscription_id, expires_at } based on subscription state logic (trial with future trial_end_date OR active with future/null expires_at = active; everything else = inactive)
    - Implement `findSubscription(pool, { device_id, product })` — returns the subscription record or null
    - Implement `activateSubscription(pool, { subscription_id, razorpay_payment_id, paid_at, billing_cycle_days })` — sets status to "active", paid_at, razorpay_payment_id, expires_at = paid_at + billing_cycle_days
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.3, 2.4, 5.5, 6.1, 7.2, 7.3_

  - [ ]* 3.2 Write property tests for subscription creation (Property 1)
    - **Property 1: Trial subscription creation preserves plan configuration**
    - For any valid device_id and product with a plan, verify subscription has status "trial", trial_end_date 7 days from creation, and amount/billing_cycle/plan_name matching the plan
    - **Validates: Requirements 1.1, 1.3, 1.4**

  - [ ]* 3.3 Write property tests for multi-product isolation (Property 2)
    - **Property 2: Multi-product subscription isolation**
    - For any device_id and set of distinct products, creating one subscription per product succeeds independently and each is retrievable by (device_id, product) pair
    - **Validates: Requirements 1.2, 7.2**

  - [ ]* 3.4 Write property tests for access status derivation (Property 3)
    - **Property 3: Access status derivation from subscription state**
    - For any subscription record, verify access check returns "active" iff status is "trial" with future trial_end_date OR status is "active" with future/null expires_at; "inactive" for all other states
    - **Validates: Requirements 2.1, 2.3, 7.3**

- [x] 4. Implement subscription expiry worker
  - [x] 4.1 Create `cloud/razorpay-service/src/expiry-worker.js`
    - Implement `expireSubscriptions(pool)` — queries subscriptions where (status='trial' AND trial_end_date < NOW() AND razorpay_payment_id IS NULL) OR (status='active' AND expires_at < NOW()), transitions them to 'expired'
    - Implement `expirePaymentLinks(pool)` — queries payments where status='pending' AND expires_at < NOW(), transitions them to 'expired'
    - Implement `startExpiryWorker(pool, intervalMs)` — runs both functions on a setInterval (default: 1 hour)
    - _Requirements: 2.2, 8.4, 9.1, 9.3_

  - [ ]* 4.2 Write property tests for subscription expiry transitions (Property 4)
    - **Property 4: Subscription expiry transitions**
    - For any subscription with status "trial" and past trial_end_date (no payment), OR status "active" and past expires_at, verify expiry worker transitions to "expired" and leaves other subscriptions unchanged
    - **Validates: Requirements 2.2, 9.1**

  - [ ]* 4.3 Write property tests for payment record expiry (Property 12)
    - **Property 12: Payment record expiry**
    - For any payment with status "pending" and past expires_at, verify expiry worker transitions payment to "expired" without affecting subscription status
    - **Validates: Requirements 8.4**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement payment link generation
  - [x] 6.1 Create `cloud/razorpay-service/src/razorpay-client.js`
    - Implement `createPaymentLink({ amount_paise, currency, description, reference_id, expire_by, callback_url, metadata })` — calls Razorpay Payment Links API (`POST /v1/payment_links`) with Basic Auth (key_id:key_secret)
    - Handle Razorpay API errors: timeout (503), 4xx (400), 5xx (503), rate limit (429)
    - Return `{ payment_link_id, short_url, expire_by }` on success
    - _Requirements: 4.1, 4.2, 4.3, 3.5_

  - [x] 6.2 Create `cloud/razorpay-service/src/payment-service.js`
    - Implement `createSubscriptionPaymentLink(pool, razorpayClient, { subscription_id, metadata })` — looks up subscription, checks for existing non-expired link (idempotency), creates Razorpay link if needed, inserts payment record with status "pending", updates subscription with payment_link_id/url/expires_at
    - Implement `createGenericPaymentLink(pool, razorpayClient, { amount_paise, description, reference_id, metadata, callback_url })` — creates a payment link not tied to subscription lifecycle
    - _Requirements: 3.2, 3.3, 4.2, 4.3, 4.4, 4.5, 10.2, 10.3_

  - [ ]* 6.3 Write property tests for payment link construction (Property 5)
    - **Property 5: Payment link request construction**
    - For any subscription with valid amount, company name, and product, verify the Razorpay API request contains exact amount_paise, currency "INR", description with company name and product, reference_id = subscription_id, expire_by ~24h from creation
    - **Validates: Requirements 3.2, 4.2, 4.3**

  - [ ]* 6.4 Write property tests for payment link persistence (Property 6)
    - **Property 6: Payment link persistence round-trip**
    - For any successful payment link creation, verify a payment record is stored with razorpay_link_id, short_url, subscription_id, amount_paise, status "pending", and created_at
    - **Validates: Requirements 4.4, 8.1**

  - [ ]* 6.5 Write property tests for payment link idempotency (Property 7)
    - **Property 7: Payment link idempotency**
    - For any subscription with an existing non-expired payment link, requesting a new link returns the existing short_url without creating a new Razorpay link or payment record
    - **Validates: Requirements 4.5**

- [x] 7. Implement webhook handler
  - [x] 7.1 Create `cloud/razorpay-service/src/webhook-handler.js`
    - Implement `verifySignature(rawBody, signature, secret)` — HMAC-SHA256 verification of X-Razorpay-Signature header
    - Implement `extractPaymentEvent(payload)` — parses `payment_link.paid` event, extracts reference_id (subscription_id), razorpay_payment_id, amount_paise from nested payload structure
    - Implement `processPaymentEvent(pool, { subscription_id, razorpay_payment_id, amount_paise, paid_at })` — updates subscription to "active" with paid_at, razorpay_payment_id, expires_at = paid_at + billing_cycle_days; updates payment record to "captured"; uses razorpay_payment_id as idempotency key
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.3, 8.2_

  - [ ]* 7.2 Write property tests for webhook signature validation (Property 8)
    - **Property 8: Webhook signature validation**
    - For any request body and secret, verify signature validation accepts iff header equals HMAC-SHA256(body, secret)
    - **Validates: Requirements 5.2**

  - [ ]* 7.3 Write property tests for webhook payload extraction (Property 9)
    - **Property 9: Webhook payload extraction**
    - For any valid payment_link.paid payload, verify extraction correctly returns reference_id, razorpay_payment_id, and amount_paise
    - **Validates: Requirements 5.4**

  - [ ]* 7.4 Write property tests for payment confirmation state transition (Property 10)
    - **Property 10: Payment confirmation state transition**
    - For any valid payment event, verify subscription transitions to "active" with correct paid_at, razorpay_payment_id, expires_at = paid_at + billing_cycle_days, and payment record transitions to "captured"
    - **Validates: Requirements 5.5, 8.2**

  - [ ]* 7.5 Write property tests for webhook idempotency (Property 11)
    - **Property 11: Webhook idempotency**
    - For any payment event processed N times, verify same database state as processing once: one "captured" payment, one "active" subscription, no duplicates
    - **Validates: Requirements 5.7**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Wire REST endpoints into Express app
  - [x] 9.1 Add subscription endpoints to `cloud/razorpay-service/src/server.js`
    - `POST /subscriptions` — calls createTrialSubscription, returns subscription record
    - `GET /subscriptions/access` — accepts query params device_id and product, calls checkAccess, returns { status, subscription_id, expires_at }
    - Input validation: return 400 for missing device_id or product
    - _Requirements: 1.1, 2.4, 7.1_

  - [x] 9.2 Add payment link endpoints to `cloud/razorpay-service/src/server.js`
    - `POST /payments/create-link` — accepts { subscription_id, metadata }, calls createSubscriptionPaymentLink, returns { payment_link_url, payment_link_id, expires_at }
    - `POST /payments/create-generic-link` — accepts { amount_paise, description, reference_id, metadata, callback_url }, calls createGenericPaymentLink
    - Error handling: 404 for subscription not found, 400 for subscription already active, 503 for Razorpay errors
    - _Requirements: 3.2, 3.3, 4.1, 10.3_

  - [x] 9.3 Add webhook endpoint to `cloud/razorpay-service/src/server.js`
    - `POST /webhook/razorpay` — verify signature, extract event, process payment, respond 200 within 5s
    - Return 401 for invalid signature, 200 for all valid payloads (even if subscription not found — prevents Razorpay retries)
    - _Requirements: 5.1, 5.2, 5.3, 5.6_

  - [ ]* 9.4 Write unit tests for REST endpoints
    - Test endpoint existence and response shapes (smoke tests)
    - Test 400 responses for invalid inputs
    - Test 404 for missing subscriptions
    - Test 401 for invalid webhook signatures
    - Use supertest for HTTP assertions, nock for Razorpay API mocking
    - _Requirements: 2.4, 5.3_

  - [ ]* 9.5 Write property tests for metadata and type passthrough (Property 13)
    - **Property 13: Payment metadata and type passthrough**
    - For any valid JSON metadata and valid payment_type, verify they are stored and retrievable unchanged
    - **Validates: Requirements 10.1, 10.2**

- [x] 10. Integrate with WhatsApp-NATS Bridge
  - [x] 10.1 Modify `cloud/whatsapp-nats-bridge/src/server.js` to add access gating
    - Before routing a question in `handleQuestionWithMapping`, call `GET http://localhost:8590/subscriptions/access?device_id=X&product=talk2tally`
    - If response status is "inactive", call `POST http://localhost:8590/payments/create-link` with the subscription_id
    - Send the returned payment_link_url to the user via WhatsApp with a message like: "Your trial has expired. Please complete payment to continue: {url}"
    - If payment service is unreachable (ECONNREFUSED/timeout), fall through to normal question routing (fail open for now) and log warning
    - _Requirements: 3.1, 3.4, 3.6, 6.2_

  - [ ]* 10.2 Write unit tests for access gating in WhatsApp Bridge
    - Mock payment service responses (active, inactive, error)
    - Verify correct message sent to user when subscription is inactive
    - Verify normal routing when subscription is active
    - Verify graceful fallback when payment service is unavailable
    - _Requirements: 3.1, 3.4, 3.6_

- [x] 11. Infrastructure wiring
  - [x] 11.1 Add razorpay-service to `cloud/ecosystem.config.js`
    - Add PM2 app entry: name "razorpay-service", cwd "./razorpay-service", script "src/index.js", same env pattern as other services
    - _Requirements: 2.4_

  - [x] 11.2 Update `cloud/nginx/talk2tally.conf` for payment routes
    - Add `location /webhook/razorpay` block proxying to `http://127.0.0.1:8590`
    - Add `location /payments/` block proxying to `http://127.0.0.1:8590`
    - Add `location /subscriptions/` block proxying to `http://127.0.0.1:8590`
    - _Requirements: 5.1_

  - [x] 11.3 Install npm dependencies for razorpay-service
    - Run `npm install` in `cloud/razorpay-service/` to generate package-lock.json and install all dependencies
    - _Requirements: 4.1_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Run `npm test` in `cloud/razorpay-service/` and `cloud/whatsapp-nats-bridge/`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The service reuses the same PostgreSQL connection (DATABASE_URL) as tenant-registry
- Razorpay credentials come from existing .env variables (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET)
