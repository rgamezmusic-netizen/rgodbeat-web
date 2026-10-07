export type RgMarketProduct = {
  productKey: string; version: number; name: string; section: 'beats' | 'studio' | 'other';
  costRg: number; benefitKind: 'beat' | 'discount' | 'studio'; allowedCategory: 'mp3' | 'wav' | 'studio';
  percentage: number | null; maximumBenefitCents: number; studioDays: number | null;
  eligibility: string; oneTime: true; expirationPolicy: 'never'; giftable: boolean; active: boolean;
};
export type RgOwnedPass = { id: string; productKey: string; version: number; status: 'available' | 'reserved' | 'consumed'; cancellableIntentId?: string | null; resumeIntentId?: string | null };

/** Catalogue terms come from immutable database versions, never from browser pricing. */
export function readMarketProduct(row: Record<string, unknown>): RgMarketProduct {
  const integers = [row.version, row.cost_rg, row.maximum_benefit_cents];
  if (!integers.every(n => Number.isSafeInteger(Number(n)) && Number(n) > 0)
    || !['beat', 'discount', 'studio'].includes(String(row.benefit_kind))
    || !['mp3', 'wav', 'studio'].includes(String(row.allowed_category))
    || row.one_time !== true || row.expiration_policy !== 'never'
    || typeof row.active !== 'boolean' || typeof row.giftable !== 'boolean') throw new Error('Invalid RG product.');
  return {
    productKey: String(row.product_key), version: Number(row.version), name: String(row.name),
    section: row.section as RgMarketProduct['section'], costRg: Number(row.cost_rg),
    benefitKind: row.benefit_kind as RgMarketProduct['benefitKind'], allowedCategory: row.allowed_category as RgMarketProduct['allowedCategory'],
    percentage: row.percentage == null ? null : Number(row.percentage), maximumBenefitCents: Number(row.maximum_benefit_cents),
    studioDays: row.studio_days == null ? null : Number(row.studio_days), eligibility: String(row.eligibility),
    oneTime: true, expirationPolicy: 'never', giftable: row.giftable, active: row.active,
  };
}

/** Integer cents, one eligible product, one benefit. Call only with validated server prices. */
export function calculateTicketPayment(product: RgMarketProduct, tier: string, priceCents: number) {
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0 || !['mp3', 'wav'].includes(tier)
    || product.allowedCategory !== tier || product.benefitKind === 'studio') throw new Error('RG ticket is not eligible.');
  if (product.benefitKind === 'beat') {
    if (priceCents > product.maximumBenefitCents) throw new Error('This license exceeds the standard Beat Pass benefit.');
    return { discountCents: priceCents, remainingCents: 0 };
  }
  if (![25, 50].includes(product.percentage ?? 0)) throw new Error('Invalid discount percentage.');
  const discountCents = Math.min(Math.floor(priceCents * product.percentage! / 100), product.maximumBenefitCents);
  return { discountCents, remainingCents: priceCents - discountCents };
}
