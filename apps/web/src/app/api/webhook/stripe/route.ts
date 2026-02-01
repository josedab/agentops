import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  constructWebhookEvent,
  getPlanFromSubscription,
} from "@/lib/billing/stripe";
import { getPostgres } from "@/lib/db";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = getPostgres();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const organizationId = session.metadata?.organizationId;

        if (organizationId && session.subscription) {
          // Update organization with Stripe customer ID and subscription
          console.log(`Checkout completed for org ${organizationId}`);
          // await db.updateOrganization(organizationId, {
          //   stripeCustomerId: session.customer as string,
          //   stripeSubscriptionId: session.subscription as string,
          // });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const organizationId = subscription.metadata?.organizationId;

        if (organizationId) {
          const plan = getPlanFromSubscription(subscription);
          console.log(
            `Subscription updated for org ${organizationId}: ${plan}`,
          );
          // await db.updateOrganization(organizationId, {
          //   plan,
          //   subscriptionStatus: subscription.status,
          // });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const organizationId = subscription.metadata?.organizationId;

        if (organizationId) {
          console.log(`Subscription cancelled for org ${organizationId}`);
          // Downgrade to free plan
          // await db.updateOrganization(organizationId, {
          //   plan: 'free',
          //   subscriptionStatus: 'canceled',
          // });
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`Invoice paid: ${invoice.id}`);
        // Record payment in your system
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`Invoice payment failed: ${invoice.id}`);
        // Handle failed payment - send notification, etc.
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }
}
