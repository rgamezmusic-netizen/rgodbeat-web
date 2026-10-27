import type { NextRequest } from 'next/server';

export const walletSameOrigin = (request: NextRequest) => {
  const origin = request.headers.get('origin');
  return (!origin || origin === request.nextUrl.origin) && request.headers.get('sec-fetch-site') !== 'cross-site';
};
export const walletRequestKey = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const rgCostFromUsd = (price: number) => {
  const cents = Math.round(price * 100);
  if (!Number.isFinite(price) || !Number.isSafeInteger(cents) || cents <= 0) throw new Error('INVALID_RG_PRICE');
  return cents;
};
