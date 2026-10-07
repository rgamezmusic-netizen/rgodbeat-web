/** Gift checkout stays off until payment and transactional email operations are ready. */
export function isGiftCheckoutEnabled(): boolean {
  return process.env.RG_GIFTS_ENABLED === "true";
}

/** Public mirror controls whether the gift choice is rendered in the cart. */
export function isGiftCheckoutVisible(): boolean {
  return process.env.NEXT_PUBLIC_RG_GIFTS_ENABLED === "true";
}

/** Server-side guard; self purchases do not depend on the gift feature flag. */
export function canCheckoutRecipientMode(mode: "self" | "gift", enabled = isGiftCheckoutEnabled()): boolean {
  return mode === "self" || enabled;
}
