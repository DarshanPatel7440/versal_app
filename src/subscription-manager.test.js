'use strict';

const {
  createTrialSubscription,
  checkAccess,
  findSubscription,
  activateSubscription,
} = require('./subscription-manager');

/**
 * Helper to create a mock pool that returns specified rows.
 */
function mockPool(queryResults) {
  let callIndex = 0;
  return {
    query: jest.fn(async () => {
      const result = queryResults[callIndex] || { rows: [] };
      callIndex++;
      return result;
    }),
  };
}

describe('subscription-manager', () => {
  describe('createTrialSubscription', () => {
    it('should throw if device_id is missing', async () => {
      const pool = mockPool([]);
      await expect(
        createTrialSubscription(pool, { device_id: '', product: 'talk2tally' })
      ).rejects.toThrow('device_id is required');
    });

    it('should throw if product is missing', async () => {
      const pool = mockPool([]);
      await expect(
        createTrialSubscription(pool, { device_id: 'dev-1', product: '' })
      ).rejects.toThrow('product is required');
    });

    it('should throw if no active plan found', async () => {
      const pool = mockPool([{ rows: [] }]);
      await expect(
        createTrialSubscription(pool, { device_id: 'dev-1', product: 'unknown' })
      ).rejects.toThrow('No active plan found for product: unknown');
    });

    it('should create a trial subscription using plan data', async () => {
      const plan = {
        plan_id: 'plan-1',
        product: 'talk2tally',
        plan_name: 'monthly',
        amount_paise: 100000,
        billing_cycle_days: 30,
      };
      const subscription = {
        subscription_id: 'sub-1',
        device_id: 'dev-1',
        product: 'talk2tally',
        plan_name: 'monthly',
        status: 'trial',
        amount_paise: 100000,
        billing_cycle_days: 30,
        trial_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      const pool = mockPool([
        { rows: [plan] },
        { rows: [subscription] },
      ]);

      const result = await createTrialSubscription(pool, {
        device_id: 'dev-1',
        product: 'talk2tally',
      });

      expect(result.status).toBe('trial');
      expect(result.amount_paise).toBe(100000);
      expect(result.plan_name).toBe('monthly');
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('should look up plan by plan_name when provided', async () => {
      const plan = {
        plan_id: 'plan-2',
        product: 'talk2tally',
        plan_name: 'yearly',
        amount_paise: 1000000,
        billing_cycle_days: 365,
      };
      const subscription = {
        subscription_id: 'sub-2',
        device_id: 'dev-1',
        product: 'talk2tally',
        plan_name: 'yearly',
        status: 'trial',
        amount_paise: 1000000,
        billing_cycle_days: 365,
        trial_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      const pool = mockPool([
        { rows: [plan] },
        { rows: [subscription] },
      ]);

      const result = await createTrialSubscription(pool, {
        device_id: 'dev-1',
        product: 'talk2tally',
        plan_name: 'yearly',
      });

      expect(result.plan_name).toBe('yearly');
      // Verify the plan query included plan_name
      const planQueryCall = pool.query.mock.calls[0];
      expect(planQueryCall[1]).toEqual(['talk2tally', 'yearly']);
    });
  });

  describe('checkAccess', () => {
    it('should throw if device_id is missing', async () => {
      const pool = mockPool([]);
      await expect(
        checkAccess(pool, { device_id: '', product: 'talk2tally' })
      ).rejects.toThrow('device_id is required');
    });

    it('should throw if product is missing', async () => {
      const pool = mockPool([]);
      await expect(
        checkAccess(pool, { device_id: 'dev-1', product: '' })
      ).rejects.toThrow('product is required');
    });

    it('should return inactive when no subscription found', async () => {
      const pool = mockPool([{ rows: [] }]);
      const result = await checkAccess(pool, { device_id: 'dev-1', product: 'talk2tally' });
      expect(result).toEqual({ status: 'inactive', subscription_id: null, expires_at: null });
    });

    it('should return active for trial with future trial_end_date', async () => {
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const pool = mockPool([{
        rows: [{
          subscription_id: 'sub-1',
          status: 'trial',
          trial_end_date: futureDate,
          expires_at: null,
        }],
      }]);

      const result = await checkAccess(pool, { device_id: 'dev-1', product: 'talk2tally' });
      expect(result.status).toBe('active');
      expect(result.subscription_id).toBe('sub-1');
      expect(result.expires_at).toEqual(futureDate);
    });

    it('should return inactive for trial with past trial_end_date', async () => {
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const pool = mockPool([{
        rows: [{
          subscription_id: 'sub-1',
          status: 'trial',
          trial_end_date: pastDate,
          expires_at: null,
        }],
      }]);

      const result = await checkAccess(pool, { device_id: 'dev-1', product: 'talk2tally' });
      expect(result.status).toBe('inactive');
      expect(result.subscription_id).toBe('sub-1');
    });

    it('should return active for active subscription with future expires_at', async () => {
      const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const pool = mockPool([{
        rows: [{
          subscription_id: 'sub-1',
          status: 'active',
          trial_end_date: null,
          expires_at: futureDate,
        }],
      }]);

      const result = await checkAccess(pool, { device_id: 'dev-1', product: 'talk2tally' });
      expect(result.status).toBe('active');
      expect(result.expires_at).toEqual(futureDate);
    });

    it('should return active for active subscription with null expires_at', async () => {
      const pool = mockPool([{
        rows: [{
          subscription_id: 'sub-1',
          status: 'active',
          trial_end_date: null,
          expires_at: null,
        }],
      }]);

      const result = await checkAccess(pool, { device_id: 'dev-1', product: 'talk2tally' });
      expect(result.status).toBe('active');
      expect(result.expires_at).toBeNull();
    });

    it('should return inactive for active subscription with past expires_at', async () => {
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const pool = mockPool([{
        rows: [{
          subscription_id: 'sub-1',
          status: 'active',
          trial_end_date: null,
          expires_at: pastDate,
        }],
      }]);

      const result = await checkAccess(pool, { device_id: 'dev-1', product: 'talk2tally' });
      expect(result.status).toBe('inactive');
    });

    it('should return inactive for expired subscription', async () => {
      const pool = mockPool([{
        rows: [{
          subscription_id: 'sub-1',
          status: 'expired',
          trial_end_date: null,
          expires_at: null,
        }],
      }]);

      const result = await checkAccess(pool, { device_id: 'dev-1', product: 'talk2tally' });
      expect(result.status).toBe('inactive');
    });

    it('should return inactive for cancelled subscription', async () => {
      const pool = mockPool([{
        rows: [{
          subscription_id: 'sub-1',
          status: 'cancelled',
          trial_end_date: null,
          expires_at: null,
        }],
      }]);

      const result = await checkAccess(pool, { device_id: 'dev-1', product: 'talk2tally' });
      expect(result.status).toBe('inactive');
    });
  });

  describe('findSubscription', () => {
    it('should throw if device_id is missing', async () => {
      const pool = mockPool([]);
      await expect(
        findSubscription(pool, { device_id: '', product: 'talk2tally' })
      ).rejects.toThrow('device_id is required');
    });

    it('should return null when no subscription found', async () => {
      const pool = mockPool([{ rows: [] }]);
      const result = await findSubscription(pool, { device_id: 'dev-1', product: 'talk2tally' });
      expect(result).toBeNull();
    });

    it('should return subscription record when found', async () => {
      const sub = { subscription_id: 'sub-1', device_id: 'dev-1', product: 'talk2tally', status: 'trial' };
      const pool = mockPool([{ rows: [sub] }]);
      const result = await findSubscription(pool, { device_id: 'dev-1', product: 'talk2tally' });
      expect(result).toEqual(sub);
    });
  });

  describe('activateSubscription', () => {
    it('should throw if subscription_id is missing', async () => {
      const pool = mockPool([]);
      await expect(
        activateSubscription(pool, {
          subscription_id: '',
          razorpay_payment_id: 'pay_123',
          paid_at: new Date(),
          billing_cycle_days: 30,
        })
      ).rejects.toThrow('subscription_id is required');
    });

    it('should throw if razorpay_payment_id is missing', async () => {
      const pool = mockPool([]);
      await expect(
        activateSubscription(pool, {
          subscription_id: 'sub-1',
          razorpay_payment_id: '',
          paid_at: new Date(),
          billing_cycle_days: 30,
        })
      ).rejects.toThrow('razorpay_payment_id is required');
    });

    it('should throw if billing_cycle_days is invalid', async () => {
      const pool = mockPool([]);
      await expect(
        activateSubscription(pool, {
          subscription_id: 'sub-1',
          razorpay_payment_id: 'pay_123',
          paid_at: new Date(),
          billing_cycle_days: 0,
        })
      ).rejects.toThrow('billing_cycle_days must be a positive integer');
    });

    it('should throw if subscription not found', async () => {
      const pool = mockPool([{ rows: [] }]);
      await expect(
        activateSubscription(pool, {
          subscription_id: 'sub-nonexistent',
          razorpay_payment_id: 'pay_123',
          paid_at: new Date(),
          billing_cycle_days: 30,
        })
      ).rejects.toThrow('Subscription not found: sub-nonexistent');
    });

    it('should activate subscription with payment details', async () => {
      const paidAt = new Date('2024-01-15T10:00:00Z');
      const updatedSub = {
        subscription_id: 'sub-1',
        status: 'active',
        paid_at: paidAt,
        razorpay_payment_id: 'pay_123',
        expires_at: new Date('2024-02-14T10:00:00Z'),
      };

      const pool = mockPool([{ rows: [updatedSub] }]);

      const result = await activateSubscription(pool, {
        subscription_id: 'sub-1',
        razorpay_payment_id: 'pay_123',
        paid_at: paidAt,
        billing_cycle_days: 30,
      });

      expect(result.status).toBe('active');
      expect(result.razorpay_payment_id).toBe('pay_123');
      expect(pool.query).toHaveBeenCalledTimes(1);

      // Verify the query parameters
      const queryCall = pool.query.mock.calls[0];
      expect(queryCall[1]).toEqual([paidAt, 'pay_123', 'sub-1', '30']);
    });
  });
});
