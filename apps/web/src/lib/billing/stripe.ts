/**
 * Stripe billing integration
 */

import Stripe from "stripe";

// Plans configuration
export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    stripePriceId: null,
    features: {
      eventsPerMonth: 100_000,
      retentionDays: 7,
      teamMembers: 1,
      apiAccess: false,
      sso: false,
      support: "community",
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 49,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || "price_pro",
    features: {
      eventsPerMonth: 500_000,
      retentionDays: 30,
      teamMembers: 5,
      apiAccess: true,
      sso: false,
      support: "email",
    },
  },
  team: {
    id: "team",
    name: "Team",
    price: 199,
    stripePriceId: process.env.STRIPE_TEAM_PRICE_ID || "price_team",
    features: {
      eventsPerMonth: 2_000_000,
      retentionDays: 90,
      teamMembers: 20,
      apiAccess: true,
      sso: true,
      support: "priority",
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: null, // Custom pricing
    stripePriceId: null,
    features: {
      eventsPerMonth: -1, // Unlimited
      retentionDays: 365,
      teamMembers: -1, // Unlimited
      apiAccess: true,
      sso: true,
      support: "dedicated",
    },
  },
} as const;

export type PlanId = keyof typeof PLANS;

// Stripe client singleton
let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is required");
    }
    stripeClient = new Stripe(secretKey, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return stripeClient;
}

// Customer management
export async function createCustomer(params: {
  email: string;
  name?: string;
  organizationId: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Customer> {
  const stripe = getStripe();
  return stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: {
      organizationId: params.organizationId,
      ...params.metadata,
    },
  });
}

export async function getCustomer(
  customerId: string,
): Promise<Stripe.Customer | null> {
  const stripe = getStripe();
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return customer as Stripe.Customer;
  } catch {
    return null;
  }
}

// Subscription management
export async function createSubscription(params: {
  customerId: string;
  priceId: string;
  trialDays?: number;
}): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.create({
    customer: params.customerId,
    items: [{ price: params.priceId }],
    trial_period_days: params.trialDays,
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
  });
}

export async function getSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription | null> {
  const stripe = getStripe();
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch {
    return null;
  }
}

export async function cancelSubscription(
  subscriptionId: string,
  immediately = false,
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  if (immediately) {
    return stripe.subscriptions.cancel(subscriptionId);
  }
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

export async function updateSubscription(
  subscriptionId: string,
  newPriceId: string,
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  return stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0].id,
        price: newPriceId,
      },
    ],
    proration_behavior: "always_invoice",
  });
}

// Checkout sessions
export async function createCheckoutSession(params: {
  customerId?: string;
  customerEmail?: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  organizationId: string;
  trialDays?: number;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: params.customerId,
    customer_email: params.customerId ? undefined : params.customerEmail,
    line_items: [
      {
        price: params.priceId,
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    subscription_data: {
      trial_period_days: params.trialDays,
      metadata: {
        organizationId: params.organizationId,
      },
    },
    metadata: {
      organizationId: params.organizationId,
    },
  });
}

// Billing portal
export async function createBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
}

// Usage-based billing
export async function reportUsage(params: {
  subscriptionItemId: string;
  quantity: number;
  timestamp?: number;
  action?: "increment" | "set";
}): Promise<Stripe.UsageRecord> {
  const stripe = getStripe();
  return stripe.subscriptionItems.createUsageRecord(params.subscriptionItemId, {
    quantity: params.quantity,
    timestamp: params.timestamp || Math.floor(Date.now() / 1000),
    action: params.action || "increment",
  });
}

export async function getUsageRecords(
  subscriptionItemId: string,
  limit = 10,
): Promise<Stripe.ApiList<Stripe.UsageRecordSummary>> {
  const stripe = getStripe();
  return stripe.subscriptionItems.listUsageRecordSummaries(subscriptionItemId, {
    limit,
  });
}

// Invoices
export async function getInvoices(
  customerId: string,
  limit = 10,
): Promise<Stripe.ApiList<Stripe.Invoice>> {
  const stripe = getStripe();
  return stripe.invoices.list({
    customer: customerId,
    limit,
  });
}

export async function getUpcomingInvoice(
  customerId: string,
): Promise<Stripe.UpcomingInvoice | null> {
  const stripe = getStripe();
  try {
    return await stripe.invoices.retrieveUpcoming({ customer: customerId });
  } catch {
    return null;
  }
}

// Webhook signature verification
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string,
): Stripe.Event {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

// Helper to get plan from subscription
export function getPlanFromSubscription(
  subscription: Stripe.Subscription,
): PlanId {
  const priceId = subscription.items.data[0]?.price.id;

  for (const [planId, plan] of Object.entries(PLANS)) {
    if (plan.stripePriceId === priceId) {
      return planId as PlanId;
    }
  }

  return "free";
}
