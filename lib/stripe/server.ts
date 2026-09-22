import "server-only";
import Stripe from "stripe";

export function getStripeSecretKey(): string | undefined {
  return process.env.STRIPE_SECRET_KEY;
}

export function getStripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}

// Backwards compatibility export
export const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * Singleton server-only Stripe client configured for Stripe Test Mode.
 */
let stripeInstance: Stripe | null = null;
let lastKeyUsed: string | null = null;

export function getStripe(): Stripe {
  const stripeSecretKey = getStripeSecretKey();

  if (!stripeSecretKey || stripeSecretKey.includes("your-stripe-secret-key")) {
    throw new Error(
      "[Stripe Server] STRIPE_SECRET_KEY is not configured or is using placeholder in .env.local. Please configure your Stripe Test Mode secret key."
    );
  }

  if (!stripeInstance || lastKeyUsed !== stripeSecretKey) {
    stripeInstance = new Stripe(stripeSecretKey, {
      apiVersion: "2025-02-24.acacia" as any,
      appInfo: {
        name: "RGODBEAT 2.0 Commerce",
        version: "2.0.0",
      },
    });
    lastKeyUsed = stripeSecretKey;
  }

  return stripeInstance;
}

/**
 * Validates whether Stripe is currently configured with real/test credentials.
 */
export function isStripeConfigured(): boolean {
  const key = getStripeSecretKey();
  return Boolean(key) && !key!.includes("your-stripe-secret-key");
}

