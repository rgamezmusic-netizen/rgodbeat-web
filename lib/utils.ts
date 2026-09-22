/**
 * RGODBEAT 2.0 - Utility Helpers
 */

/**
 * Combines class names safely (utility placeholder for Tailwind CSS)
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Format price in USD currency format
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/**
 * Format duration in seconds to mm:ss format
 */
export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}
