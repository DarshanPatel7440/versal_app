-- Migration 001: Full Schema for Global Payment Service (Fresh DB)
-- Requires PostgreSQL 14+

-- =============================================================================
-- 0. Enable pgcrypto for gen_random_uuid()
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. Create subscriptions table
-- =============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    subscription_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id               VARCHAR(255) NOT NULL,
    product                 VARCHAR(50) NOT NULL DEFAULT 'talk2tally',
    plan_name               VARCHAR(100),
    status                  VARCHAR(20) NOT NULL DEFAULT 'trial'
                            CHECK (status IN ('trial', 'active', 'expired', 'cancelled')),
    amount_paise            INTEGER,
    billing_cycle_days      INTEGER DEFAULT 30,
    trial_end_date          TIMESTAMPTZ,
    expires_at              TIMESTAMPTZ,
    paid_at                 TIMESTAMPTZ,
    razorpay_payment_id     VARCHAR(255),
    payment_link_id         VARCHAR(255),
    payment_link_url        TEXT,
    payment_link_expires_at TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One subscription per device per product
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_device_product
  ON subscriptions (device_id, product);

-- =============================================================================
-- 2. Create plans table
-- =============================================================================

CREATE TABLE IF NOT EXISTS plans (
    plan_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product             VARCHAR(50) NOT NULL,
    plan_name           VARCHAR(100) NOT NULL,
    amount_paise        INTEGER NOT NULL,
    billing_cycle_days  INTEGER NOT NULL DEFAULT 30,
    description         TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default Talk2Tally monthly plan (₹1,000 = 100000 paise, 30-day cycle)
INSERT INTO plans (product, plan_name, amount_paise, billing_cycle_days, description)
VALUES ('talk2tally', 'monthly', 100000, 30, 'Talk2Tally Monthly - ₹1,000/month')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 3. Create payments table
-- =============================================================================

CREATE TABLE IF NOT EXISTS payments (
    payment_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id         UUID NOT NULL REFERENCES subscriptions(subscription_id),
    amount_paise            INTEGER NOT NULL,
    currency                VARCHAR(10) NOT NULL DEFAULT 'INR',
    status                  VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'captured', 'expired', 'failed')),
    payment_type            VARCHAR(20) NOT NULL DEFAULT 'subscription'
                            CHECK (payment_type IN ('subscription', 'recharge', 'addon', 'upgrade')),
    razorpay_link_id        VARCHAR(255),
    razorpay_payment_id     VARCHAR(255),
    reference_id            VARCHAR(255),
    short_url               TEXT,
    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at                 TIMESTAMPTZ,
    expires_at              TIMESTAMPTZ
);

-- Index for webhook lookup by reference_id
CREATE INDEX IF NOT EXISTS idx_payments_reference_id ON payments (reference_id);

-- Unique partial index for idempotency on razorpay_payment_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id
  ON payments (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
