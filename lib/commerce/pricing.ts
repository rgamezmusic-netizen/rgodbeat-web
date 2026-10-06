/** True only when a separately configured sale amount is exactly half price. */
export function isExactStoreDiscount(regularPrice: number, salePrice: number): boolean {
  return Math.round(salePrice * 100) === Math.round(regularPrice * 0.5 * 100);
}
