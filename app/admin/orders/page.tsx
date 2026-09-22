import React from "react";
import { requireAdminAuth } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  await requireAdminAuth("/admin/orders");
  const supabase = createAdminClient();

  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      id,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      status,
      payment_status,
      currency,
      subtotal_amount,
      total_amount,
      created_at,
      customers (
        id,
        email,
        name
      ),
      order_items (
        id,
        unit_price,
        beats (
          id,
          title,
          slug
        ),
        license_types (
          name,
          slug
        )
      ),
      purchases (
        id,
        license_tier,
        status
      )
    `)
    .order("created_at", { ascending: false });

  const ordersList = (orders as any[]) || [];

  const totalRevenue = ordersList
    .filter((o) => o.payment_status === "paid")
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  const completedCount = ordersList.filter((o) => o.status === "completed").length;

  return (
    <div className="space-y-8">
      {/* Page Title & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white uppercase">
            COMMERCE & ORDERS
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Verified Stripe test transactions, customer purchases, and active license entitlements.
          </p>
        </div>

        {/* Commerce Quick Metrics */}
        <div className="flex items-center gap-3">
          <div className="px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] font-mono text-right">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">TOTAL REVENUE</div>
            <div className="text-lg font-bold text-emerald-400">{formatCurrency(totalRevenue)}</div>
          </div>
          <div className="px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] font-mono text-right">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">COMPLETED ORDERS</div>
            <div className="text-lg font-bold text-white">{completedCount}</div>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-[#0e0e14] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-wider uppercase text-white font-mono">
            ALL ORDERS ({ordersList.length})
          </h2>
          <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
            STRIPE TEST MODE
          </span>
        </div>

        {ordersList.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-zinc-400 text-sm">No orders recorded yet.</p>
            <p className="text-zinc-600 text-xs font-mono">
              Complete a test checkout to see orders and customer entitlements populate here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white/[0.02] border-b border-white/[0.06] text-zinc-400">
                <tr>
                  <th className="py-3 px-4 font-semibold uppercase">Order ID / Date</th>
                  <th className="py-3 px-4 font-semibold uppercase">Customer</th>
                  <th className="py-3 px-4 font-semibold uppercase">Items & Licenses</th>
                  <th className="py-3 px-4 font-semibold uppercase text-right">Total</th>
                  <th className="py-3 px-4 font-semibold uppercase text-center">Payment</th>
                  <th className="py-3 px-4 font-semibold uppercase text-center">Status</th>
                  <th className="py-3 px-4 font-semibold uppercase">Stripe Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {ordersList.map((order) => {
                  const customer = order.customers;
                  const items = order.order_items || [];
                  const purchases = order.purchases || [];

                  const isPaid = order.payment_status === "paid";
                  const isCompleted = order.status === "completed";

                  return (
                    <tr key={order.id} className="hover:bg-white/[0.01] transition-colors">
                      {/* Order ID & Date */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="font-bold text-white">{order.id.slice(0, 8)}...</div>
                        <div className="text-[10px] text-zinc-500">
                          {new Date(order.created_at).toLocaleDateString()} {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="py-4 px-4">
                        <div className="text-zinc-200">{customer?.name || "Customer"}</div>
                        <div className="text-[10px] text-zinc-400 truncate max-w-[160px]">
                          {customer?.email || "—"}
                        </div>
                      </td>

                      {/* Items */}
                      <td className="py-4 px-4">
                        <div className="space-y-1 max-w-xs">
                          {items.map((oi: any) => (
                            <div key={oi.id} className="text-zinc-300 truncate">
                              <strong>{oi.beats?.title || "Beat"}</strong>
                              <span className="text-[10px] text-purple-400 ml-1.5 px-1 py-0.5 rounded bg-purple-500/10">
                                {oi.license_types?.name || "License"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Total */}
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <div className="font-bold text-white text-sm">
                          {formatCurrency(Number(order.total_amount))}
                        </div>
                        <div className="text-[10px] text-zinc-500 uppercase">{order.currency}</div>
                      </td>

                      {/* Payment Status */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isPaid
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {order.payment_status}
                        </span>
                      </td>

                      {/* Order Status & Entitlement */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isCompleted
                              ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {order.status}
                        </span>
                        <div className="text-[10px] text-zinc-500 mt-1">
                          {purchases.length} {purchases.length === 1 ? "entitlement" : "entitlements"}
                        </div>
                      </td>

                      {/* Stripe Reference */}
                      <td className="py-4 px-4 whitespace-nowrap text-zinc-500 text-[10px]">
                        <div>SESS: {order.stripe_checkout_session_id.slice(0, 14)}...</div>
                        {order.stripe_payment_intent_id && (
                          <div>PI: {order.stripe_payment_intent_id.slice(0, 14)}...</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
