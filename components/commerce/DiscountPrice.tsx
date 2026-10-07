import { formatCurrency } from "@/lib/utils";
import { isExactStoreDiscount } from "@/lib/commerce/pricing";

interface DiscountPriceProps {
  regularPrice?: number;
  price: number;
  className?: string;
  compact?: boolean;
  tone?: "light" | "dark";
}

/** Displays the amount charged first, with the original price crossed out to its right. */
export function DiscountPrice({ regularPrice, price, className = "", compact = false, tone = "light" }: DiscountPriceProps) {
  const hasDiscount = regularPrice !== undefined && regularPrice > price;
  const discountLabel = hasDiscount && isExactStoreDiscount(regularPrice, price) ? "50% OFF" : null;

  return (
    <span className={`inline-flex flex-nowrap items-baseline gap-x-2 whitespace-nowrap ${className}`}>
      <strong className={`font-mono font-bold ${tone === "dark" ? "text-zinc-950" : "text-white"}`}>{formatCurrency(price)}</strong>
      {hasDiscount && (
        <span className={`${compact ? "text-[10px]" : "text-xs"} font-mono ${tone === "dark" ? "text-zinc-600" : "text-zinc-500"} line-through`}>
          {formatCurrency(regularPrice)}
        </span>
      )}
      {discountLabel && (
        <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase text-black">
          {discountLabel}
        </span>
      )}
    </span>
  );
}
