export function isWorkspaceRoute(pathname: string) {
  return ["/studio", "/admin", "/checkout", "/rg/wallet/checkout"]
    .some(route => pathname === route || pathname.startsWith(`${route}/`));
}
