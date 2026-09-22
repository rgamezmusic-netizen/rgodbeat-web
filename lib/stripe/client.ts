"use client";

import { loadStripe, Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null>;

export function getStripeClient() {
  if (!stripePromise) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}
