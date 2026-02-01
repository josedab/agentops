import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import {
  PLANS,
  createCheckoutSession,
  createBillingPortalSession,
  getSubscription,
  cancelSubscription,
  getInvoices,
  getUpcomingInvoice,
} from "@/lib/billing/stripe";

export const billingRouter = router({
  // Get available plans
  getPlans: publicProcedure.query(async () => {
    return Object.entries(PLANS).map(([id, plan]) => ({
      id,
      name: plan.name,
      price: plan.price,
      features: plan.features,
    }));
  }),

  // Get current subscription status
  getSubscription: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      // In production, get subscription ID from database
      // const org = await db.getOrganization(input.organizationId);
      // const subscription = await getSubscription(org.stripeSubscriptionId);

      // Mock response
      return {
        plan: "team",
        status: "active",
        currentPeriodStart: new Date("2026-01-01"),
        currentPeriodEnd: new Date("2026-02-01"),
        cancelAtPeriodEnd: false,
      };
    }),

  // Create checkout session for new subscription
  createCheckoutSession: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        planId: z.enum(["pro", "team"]),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      }),
    )
    .mutation(async ({ input }) => {
      const plan = PLANS[input.planId];
      if (!plan.stripePriceId) {
        throw new Error("Invalid plan");
      }

      const session = await createCheckoutSession({
        priceId: plan.stripePriceId,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        organizationId: input.organizationId,
        trialDays: 14,
      });

      return { url: session.url };
    }),

  // Create billing portal session
  createPortalSession: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        returnUrl: z.string().url(),
      }),
    )
    .mutation(async ({ input }) => {
      // In production, get customer ID from database
      // const org = await db.getOrganization(input.organizationId);
      const customerId = "cus_mock"; // org.stripeCustomerId

      const session = await createBillingPortalSession({
        customerId,
        returnUrl: input.returnUrl,
      });

      return { url: session.url };
    }),

  // Cancel subscription
  cancelSubscription: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        immediately: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      // In production, get subscription ID from database
      // const org = await db.getOrganization(input.organizationId);
      const subscriptionId = "sub_mock"; // org.stripeSubscriptionId

      await cancelSubscription(subscriptionId, input.immediately);
      return { success: true };
    }),

  // Get invoices
  getInvoices: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        limit: z.number().min(1).max(100).default(10),
      }),
    )
    .query(async ({ input }) => {
      // Mock invoices
      return [
        {
          id: "inv_1",
          amount: 199,
          status: "paid",
          date: new Date("2026-01-01"),
          pdfUrl: "https://stripe.com/invoice.pdf",
        },
        {
          id: "inv_2",
          amount: 199,
          status: "paid",
          date: new Date("2025-12-01"),
          pdfUrl: "https://stripe.com/invoice.pdf",
        },
      ];
    }),

  // Get usage for current period
  getUsage: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      // Mock usage data - in production, query from ClickHouse
      return {
        events: {
          used: 1_234_567,
          limit: 2_000_000,
          percentage: 62,
        },
        storage: {
          used: 4.5,
          limit: 10,
          percentage: 45,
          unit: "GB",
        },
        apiCalls: {
          used: 45_678,
          limit: 100_000,
          percentage: 46,
        },
        period: {
          start: new Date("2026-01-01"),
          end: new Date("2026-02-01"),
        },
      };
    }),
});
