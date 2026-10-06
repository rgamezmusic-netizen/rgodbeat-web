import { formatCurrency } from "@/lib/utils";
import { isExactStoreDiscount } from "@/lib/commerce/pricing";

interface DiscountPriceProps {
  regularPrice?: number;
  price: number;
  className?: string;
  compact?: boolean;
}

/** Displays the original price first, followed by the amount actually charged. */
export function DiscountPrice({ regularPrice, price, className = "", compact = false }: DiscountPriceProps) {
  const hasDiscount = regularPrice !== undefined && regularPrice > price;
  const discountLabel = hasDiscount && isExactStoreDiscount(regularPrice, price) ? "50% OFF" : null;

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`}>
      {hasDiscount && (
        <span className={`${compact ? "text-[10px]" : "text-xs"} font-mono text-zinc-500 line-through`}>
          {formatCurrency(regularPrice)}
        </span>
      )}
      <strong className="font-mono font-bold text-white">{formatCurrency(price)}</strong>
      {discountLabel && (
        <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase text-black">
          {discountLabel}
        </span>
      )}
    </span>
  );
}
