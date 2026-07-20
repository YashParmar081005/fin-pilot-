/**
 * Razorpay subscriptions client (plan.md §32 Phase 23). Razorpay is the ONLY
 * provider in v1 (§ decision 3); this interface is the seam a second provider
 * would plug into. Tests inject a mock via setRazorpaySubscriptionClient —
 * the real client needs pre-created Razorpay plan ids from env.
 */
import type { Plan } from '@finpilot/shared';
import { getEnv } from '../../config/env';
import { AppError } from '../../utils/AppError';

export interface CreatedSubscription {
  id: string; // 'sub_...'
  shortUrl: string; // hosted checkout the customer completes
}

export interface RazorpaySubscriptionClient {
  createSubscription(input: {
    plan: Plan;
    notes: Record<string, string>;
  }): Promise<CreatedSubscription>;
}

class RestClient implements RazorpaySubscriptionClient {
  async createSubscription(input: {
    plan: Plan;
    notes: Record<string, string>;
  }): Promise<CreatedSubscription> {
    const env = getEnv();
    const planId = {
      free: undefined,
      starter: env.RAZORPAY_PLAN_ID_STARTER,
      professional: env.RAZORPAY_PLAN_ID_PROFESSIONAL,
      enterprise: env.RAZORPAY_PLAN_ID_ENTERPRISE,
    }[input.plan];
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !planId) {
      throw new AppError('SYS_SERVICE_UNAVAILABLE', 503, {
        service: 'razorpay',
        reason: 'subscription keys/plan ids not configured',
      });
    }
    const res = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      },
      body: JSON.stringify({
        plan_id: planId,
        total_count: 12, // yearly commitment billed monthly; renewed by webhook
        customer_notify: 1,
        notes: input.notes,
      }),
    });
    if (!res.ok) {
      throw new AppError('SYS_SERVICE_UNAVAILABLE', 503, {
        service: 'razorpay',
        status: res.status,
      });
    }
    const body = (await res.json()) as { id: string; short_url: string };
    return { id: body.id, shortUrl: body.short_url };
  }
}

let client: RazorpaySubscriptionClient = new RestClient();

export function getRazorpaySubscriptionClient(): RazorpaySubscriptionClient {
  return client;
}
export function setRazorpaySubscriptionClient(c: RazorpaySubscriptionClient): void {
  client = c;
}
