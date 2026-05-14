# Requirements Document

## Introduction

The Global Payment Service is a centralized payment and subscription management layer for the Talk2Tally product ecosystem. It handles billing, subscriptions, free trials, and payment confirmation using Razorpay Payment Links. Billing is company-based (per company, not per user), meaning one company pays a flat monthly fee and all users under that company get access. The service is designed to be reusable across multiple products (Talk2Tally, ERP, future products), though the initial implementation focuses on Talk2Tally with WhatsApp-native payment flows.

## Glossary

- **Payment_Service**: The centralized Razorpay service (`cloud/razorpay-service`) responsible for creating payment links, processing webhooks, and managing payment records.
- **Subscription_Manager**: The component within Payment_Service that manages subscription lifecycle including trial creation, expiration, renewal, and status transitions.
- **WhatsApp_Bridge**: The existing WhatsApp-NATS Bridge service (`cloud/whatsapp-nats-bridge`) that routes WhatsApp messages and delivers payment links to users.
- **Tenant_Registry**: The existing data access layer (`cloud/tenant-registry`) that manages devices, user-company mappings, and subscriptions in PostgreSQL.
- **Company**: A billing entity representing a business organization. All users under a Company share a single subscription and payment plan.
- **Trial_Period**: A 7-day free access window granted to every new Company upon first registration.
- **Payment_Link**: A Razorpay-generated URL that allows a user to complete payment via UPI, cards, netbanking, or other supported methods without a custom checkout page.
- **Webhook_Handler**: The component that receives and validates Razorpay webhook events to confirm payment status.
- **Product**: A software offering (e.g., Talk2Tally, ERP) that integrates with the Payment_Service for billing.

## Requirements

### Requirement 1: Company-Based Subscription Creation

**User Story:** As a product owner, I want every new company to automatically receive a subscription record when they register, so that billing is tracked at the company level from day one.

#### Acceptance Criteria

1. WHEN a new Company is registered through the onboarding flow, THE Subscription_Manager SHALL create a subscription record linked to that Company with a "trial" status and a trial_end_date set to 7 days from creation.
2. THE Subscription_Manager SHALL associate the subscription with a product identifier so that the same Company can have separate subscriptions for different Products.
3. THE Subscription_Manager SHALL store the subscription amount (in paise), billing cycle, and plan name alongside the subscription record.
4. WHEN a subscription record is created, THE Subscription_Manager SHALL set the billing amount to the configured plan price for the specified Product (e.g., ₹1,000/month for Talk2Tally).

### Requirement 2: Trial Period Access Control

**User Story:** As a company user, I want to have full product access during my 7-day free trial, so that I can evaluate the product before paying.

#### Acceptance Criteria

1. WHILE a Company subscription has status "trial" and the current date is before trial_end_date, THE Payment_Service SHALL report the subscription as "active" when queried for access status.
2. WHEN the current date exceeds the trial_end_date and no successful payment has been recorded, THE Subscription_Manager SHALL transition the subscription status from "trial" to "expired".
3. WHILE a Company subscription has status "expired", THE Payment_Service SHALL report the subscription as "inactive" when queried for access status.
4. THE Payment_Service SHALL provide an access-check endpoint that accepts a device_id and product identifier and returns the current subscription status (active or inactive).

### Requirement 3: WhatsApp-Native Payment Flow

**User Story:** As a Talk2Tally user on WhatsApp, I want to receive a payment link directly in my chat when my trial expires, so that I can pay without leaving WhatsApp.

#### Acceptance Criteria

1. WHEN a user sends any message via WhatsApp and the Company subscription status is "expired", THE WhatsApp_Bridge SHALL request a payment link from the Payment_Service instead of processing the message.
2. WHEN the Payment_Service receives a payment link request, THE Payment_Service SHALL call the Razorpay Payment Links API to generate a new payment link with the Company subscription amount, a description referencing the Company name and Product, and a unique reference_id tied to the subscription.
3. WHEN a payment link is successfully generated, THE Payment_Service SHALL return the short URL to the calling service.
4. WHEN the WhatsApp_Bridge receives a payment link URL from the Payment_Service, THE WhatsApp_Bridge SHALL send a WhatsApp message to the user containing the payment link and a prompt to complete payment.
5. IF the Razorpay Payment Links API returns an error, THEN THE Payment_Service SHALL log the error details and return a failure response to the calling service.
6. WHEN the WhatsApp_Bridge receives a failure response from the Payment_Service, THE WhatsApp_Bridge SHALL send a message to the user indicating that payment link generation failed and to try again later.

### Requirement 4: Razorpay Payment Link Generation

**User Story:** As a system operator, I want payment links generated through Razorpay without building a custom checkout page, so that payment collection is simple and secure.

#### Acceptance Criteria

1. THE Payment_Service SHALL use the Razorpay Payment Links API (`POST /v1/payment_links`) to create payment links.
2. WHEN creating a payment link, THE Payment_Service SHALL include: amount (in paise), currency (INR), description, reference_id (subscription_id), and callback_url for post-payment redirect.
3. THE Payment_Service SHALL set the payment link expiry to 24 hours from creation.
4. THE Payment_Service SHALL store the generated payment link ID, short URL, and creation timestamp in the database linked to the subscription record.
5. WHEN a payment link already exists for a subscription and has not expired, THE Payment_Service SHALL return the existing link instead of creating a new one.

### Requirement 5: Razorpay Webhook Payment Confirmation

**User Story:** As a system operator, I want payment confirmations handled automatically via webhooks, so that access is restored immediately after payment without manual intervention.

#### Acceptance Criteria

1. THE Webhook_Handler SHALL expose an HTTP POST endpoint (`/webhook/razorpay`) to receive Razorpay webhook events.
2. WHEN a webhook request is received, THE Webhook_Handler SHALL validate the request signature using HMAC-SHA256 with the configured webhook secret.
3. IF the webhook signature validation fails, THEN THE Webhook_Handler SHALL respond with HTTP 401 and discard the event.
4. WHEN a `payment_link.paid` event is received with a valid signature, THE Webhook_Handler SHALL extract the reference_id (subscription_id) and payment details from the payload.
5. WHEN a valid payment event is processed, THE Subscription_Manager SHALL update the subscription status to "active", set the paid_at timestamp, store the Razorpay payment_id, and set expires_at to one billing cycle from the payment date.
6. THE Webhook_Handler SHALL respond with HTTP 200 within 5 seconds of receiving the webhook to prevent Razorpay retries.
7. THE Webhook_Handler SHALL be idempotent: processing the same payment event multiple times SHALL produce the same result without creating duplicate records.

### Requirement 6: Access Restoration After Payment

**User Story:** As a company user, I want my product access restored immediately after I complete payment, so that I can continue using the product without delay.

#### Acceptance Criteria

1. WHEN the Subscription_Manager updates a subscription status to "active" after payment confirmation, THE Payment_Service SHALL make the updated status available for access checks within 5 seconds.
2. WHEN a user sends a message via WhatsApp after payment is confirmed, THE WhatsApp_Bridge SHALL verify the subscription status and route the message normally if the status is "active".
3. WHEN access is restored for a Company, THE Payment_Service SHALL record a payment_confirmation event with the subscription_id, payment_id, amount, and timestamp for audit purposes.

### Requirement 7: Multi-Product Support

**User Story:** As a platform architect, I want the payment service to support multiple products with independent subscriptions, so that adding new products does not require rebuilding payment logic.

#### Acceptance Criteria

1. THE Payment_Service SHALL accept a product identifier parameter on all subscription and payment operations.
2. THE Subscription_Manager SHALL allow a single Company (device_id) to hold multiple subscriptions, one per Product.
3. WHEN checking access status, THE Payment_Service SHALL evaluate the subscription for the specific Product requested, independent of other Product subscriptions for the same Company.
4. THE Payment_Service SHALL support configurable pricing per Product, stored in a plans table with fields: plan_id, product, plan_name, amount_paise, billing_cycle_days, and description.

### Requirement 8: Payment Records and Audit Trail

**User Story:** As a system operator, I want a complete record of all payment transactions, so that I can reconcile payments and investigate issues.

#### Acceptance Criteria

1. WHEN a payment link is created, THE Payment_Service SHALL insert a record into a payments table with: payment_id (from Razorpay), subscription_id, amount_paise, status ("pending"), razorpay_link_id, and created_at.
2. WHEN a payment is confirmed via webhook, THE Payment_Service SHALL update the payment record status to "captured" and store the razorpay_payment_id and paid_at timestamp.
3. THE Payment_Service SHALL retain all payment records indefinitely for audit purposes.
4. IF a payment link expires without payment, THEN THE Payment_Service SHALL update the payment record status to "expired".

### Requirement 9: Subscription Expiry and Renewal

**User Story:** As a company user, I want my subscription to auto-expire at the end of the billing cycle so that I am prompted to renew, and I want renewal to be as simple as the initial payment.

#### Acceptance Criteria

1. WHEN the current date exceeds a subscription's expires_at date, THE Subscription_Manager SHALL transition the subscription status to "expired".
2. WHEN a subscription transitions to "expired", THE Payment_Service SHALL follow the same payment flow as post-trial expiry (generate payment link on next user interaction).
3. THE Subscription_Manager SHALL support a scheduled check (cron or polling) that identifies and expires subscriptions whose expires_at has passed.

### Requirement 10: Extensibility for Future Billing Models

**User Story:** As a platform architect, I want the payment service schema to accommodate future billing models (recharges, add-ons, plan upgrades), so that the system can evolve without major restructuring.

#### Acceptance Criteria

1. THE Payment_Service SHALL store a payment_type field on each payment record to distinguish between: "subscription", "recharge", "addon", and "upgrade".
2. THE Payment_Service SHALL accept arbitrary metadata (JSON) on payment link creation requests, allowing calling services to attach context-specific data.
3. THE Payment_Service SHALL expose a generic "create payment link" endpoint that is not coupled to subscription logic, enabling one-off payments for recharges or add-ons.

