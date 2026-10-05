import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type Phase2Error = { code?: string; message?: string };
export type Phase2Result<T> = { data: T | null; error: Phase2Error | null };
export interface Phase2Query<T = unknown> extends PromiseLike<Phase2Result<T>> {
  select(columns?: string): Phase2Query<unknown[]>;
  insert(values: unknown): Phase2Query<unknown>;
  update(values: unknown): Phase2Query<unknown>;
  eq(column: string, value: unknown): Phase2Query<T>;
  lt(column: string, value: unknown): Phase2Query<T>;
  lte(column: string, value: unknown): Phase2Query<T>;
  in(column: string, values: unknown[]): Phase2Query<T>;
  order(column: string, options?: { ascending?: boolean }): Phase2Query<T>;
  limit(value: number): Phase2Query<T>;
  single(): Phase2Query<unknown>;
  maybeSingle(): Phase2Query<unknown>;
}
export interface Phase2AdminClient {
  from(table: string): Phase2Query;
  rpc(name: string, args?: Record<string, unknown>): Phase2Query<unknown>;
}

export function createPhase2AdminClient(): Phase2AdminClient {
  return createAdminClient() as unknown as Phase2AdminClient;
}
