import type { LicenseTier } from "@/types";

export const STORE_DISCOUNT_PERCENT = 50;

export function applyStoreDiscount(price: number): number {
  return Math.round((Number(price) * (100 - STORE_DISCOUNT_PERCENT)) / 100 * 100) / 100;
}

export function getStorePrice(
  regularPrice: number,
  tier: LicenseTier
): number {
  const discounted = applyStoreDiscount(regularPrice);
  // Exclusive licensing has an existing $200 minimum that remains in force.
  return tier === "exclusive" ? Math.max(200, discounted) : discounted;
}

export function isExactStoreDiscount(regularPrice: number, salePrice: number): boolean {
  return Math.round(salePrice * 100) === Math.round(regularPrice * 0.5 * 100);
}
