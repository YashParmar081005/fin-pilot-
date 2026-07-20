/**
 * Plan catalogue (plan.md §19.4, §9 Organization.limits). Limits are DATA —
 * they are copied onto Organization.limits when a plan activates, so raising
 * one customer's limit never needs a deploy. Prices are integer paise (I1).
 */
export const PLANS = ['free', 'starter', 'professional', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanLimits {
  maxCompanies: number;
  maxUsers: number;
  maxInvoicesMonth: number;
  aiTokensMonth: number;
  ocrPagesMonth: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxCompanies: 1,
    maxUsers: 3,
    maxInvoicesMonth: 50,
    aiTokensMonth: 200_000,
    ocrPagesMonth: 25,
  },
  starter: {
    maxCompanies: 3,
    maxUsers: 10,
    maxInvoicesMonth: 500,
    aiTokensMonth: 1_000_000,
    ocrPagesMonth: 200,
  },
  professional: {
    maxCompanies: 10,
    maxUsers: 25,
    maxInvoicesMonth: 5_000,
    aiTokensMonth: 5_000_000,
    ocrPagesMonth: 1_000,
  },
  enterprise: {
    maxCompanies: 100,
    maxUsers: 100,
    maxInvoicesMonth: 50_000,
    aiTokensMonth: 25_000_000,
    ocrPagesMonth: 10_000,
  },
};

/** Monthly price in paise. Free is ₹0; enterprise is priced by sales. */
export const PLAN_PRICE_PAISE: Record<Plan, number> = {
  free: 0,
  starter: 99_900, // ₹999
  professional: 2_99_900, // ₹2,999
  enterprise: 9_99_900, // ₹9,999 (list; enterprise deals override)
};

export function nextPlan(plan: Plan): Plan | null {
  const i = PLANS.indexOf(plan);
  return i >= 0 && i < PLANS.length - 1 ? (PLANS[i + 1] ?? null) : null;
}

/**
 * The §32 Phase-23 contract: every 402 SYS_PLAN_LIMIT_EXCEEDED carries this
 * shape in `details.upgrade` so the client can render an upgrade CTA.
 */
export interface UpgradePath {
  currentPlan: Plan;
  nextPlan: Plan | null;
  url: string;
}

export function upgradePathFor(plan: Plan): UpgradePath {
  return { currentPlan: plan, nextPlan: nextPlan(plan), url: '/settings/billing' };
}
