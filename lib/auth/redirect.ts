/** Only allow navigation within this site, including query strings. */
export function safeAuthRedirect(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20\x7f]/.test(value)) return fallback;
  const url = new URL(value, "https://rgodbeat.invalid");
  if (url.origin !== "https://rgodbeat.invalid" || url.pathname === "/login" || url.pathname === "/reset-password") return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
