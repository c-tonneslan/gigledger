"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import useSWR from "swr";

import { api } from "@/lib/api";
import { money, moneyPrecise, monthLabel, shortDate } from "@/lib/format";

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const clientId = Number(params.id);
  const { data: clients } = useSWR("clients", api.clients);
  const { data: rates } = useSWR("rates-long", () => api.hourlyRates(540));
  const { data: txs } = useSWR("txs-all", () => api.transactions({ limit: 1000 }));

  const client = clients?.find((c) => c.id === clientId);
  const rate = rates?.find((r) => r.client_id === clientId);

  const monthly = useMemo(() => {
    if (!txs) return [];
    const byMonth = new Map<string, number>();
    for (const tx of txs) {
      if (tx.client_id !== clientId) continue;
      if (tx.tx_type !== "income") continue;
      const m = tx.posted_on.slice(0, 7);
      byMonth.set(m, (byMonth.get(m) || 0) + Number(tx.amount));
    }
    const months = Array.from(byMonth.keys()).sort();
    return months.map((m) => ({
      month: monthLabel(m),
      net: Math.round(byMonth.get(m)! * 100) / 100,
    }));
  }, [txs, clientId]);

  const payouts = useMemo(() => {
    if (!txs) return [];
    return txs
      .filter((t) => t.client_id === clientId && t.tx_type === "income")
      .sort((a, b) => (a.posted_on > b.posted_on ? -1 : 1));
  }, [txs, clientId]);

  // Build rolling effective rate: cumulative gross divided by cumulative hours up to each
  // payment. Useful for spotting platforms where the rate is sliding over time.
  const rateTrend = useMemo(() => {
    if (!payouts.length) return [];
    const quoted = client?.default_hourly_rate ? Number(client.default_hourly_rate) : null;
    const points: { month: string; effective: number; quoted?: number }[] = [];
    let cumGross = 0;
    let cumHours = 0;
    const sorted = [...payouts].sort((a, b) => (a.posted_on < b.posted_on ? -1 : 1));
    for (const p of sorted) {
      cumGross += Number(p.amount);
      if (quoted && quoted > 0) {
        // Back into hours via gross / quoted, since we don't have an engagement per-payment.
        cumHours += Number(p.amount) / quoted;
      }
      if (cumHours > 0) {
        points.push({
          month: monthLabel(p.posted_on.slice(0, 7)),
          effective: Math.round((cumGross / cumHours) * 100) / 100,
          quoted: quoted || undefined,
        });
      }
    }
    return points;
  }, [payouts, client]);

  if (clients && !client) {
    return (
      <div className="card text-center text-ink-500">
        <div className="text-lg font-medium">Client not found</div>
        <p className="mt-1 text-sm">
          <Link className="link" href="/clients">
            ← Back to all clients
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-xs text-ink-500 hover:text-ink-700" href="/clients">
          ← All clients
        </Link>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-1">
          {client?.name || "…"}
        </h1>
        <p className="subtle mt-1">
          {client?.platform || "Direct"} · quoted{" "}
          {client?.default_hourly_rate ? moneyPrecise(client.default_hourly_rate) : "—"}/hr
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Gross (18 mo)" value={rate ? money(rate.gross_income) : "—"} />
        <Stat label="Hours" value={rate ? Number(rate.hours).toFixed(1) : "—"} />
        <Stat
          label="Effective rate"
          value={rate?.effective_rate ? moneyPrecise(rate.effective_rate) : "—"}
          tone="good"
        />
        <Stat label="Payouts" value={String(payouts.length || "—")} />
      </div>

      {monthly.length > 0 && (
        <div className="card">
          <div className="label">Monthly gross from this client</div>
          <div className="text-lg font-medium mt-0.5 mb-4">
            How lumpy this engagement really is
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly}>
                <CartesianGrid stroke="#eeeeec" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => money(Number(v))}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <Tooltip
                  formatter={(v: number) => money(v)}
                  contentStyle={{ borderRadius: 8, borderColor: "#eeeeec", fontSize: 12 }}
                />
                <Bar dataKey="net" fill="#1f8a5a" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {rateTrend.length > 1 && (
        <div className="card">
          <div className="label">Rolling effective rate</div>
          <div className="text-lg font-medium mt-0.5 mb-4">Cumulative gross / hours over time</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rateTrend}>
                <CartesianGrid stroke="#eeeeec" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `$${v}`}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                />
                <Tooltip
                  formatter={(v: number) => moneyPrecise(v)}
                  contentStyle={{ borderRadius: 8, borderColor: "#eeeeec", fontSize: 12 }}
                />
                <Line type="monotone" dataKey="effective" stroke="#1f8a5a" strokeWidth={2} dot={false} />
                {rateTrend[0].quoted && (
                  <Line
                    type="monotone"
                    dataKey="quoted"
                    stroke="#878781"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="subtle mt-3">
            Solid line is what you actually banked per hour; dashed is the quoted rate. Cumulative,
            so it smooths out single-month variance.
          </p>
        </div>
      )}

      <div className="card">
        <div className="label">Payment history</div>
        <div className="text-lg font-medium mt-0.5 mb-3">Latest payouts first</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-400 text-xs uppercase">
              <th className="font-medium pb-2">Date</th>
              <th className="font-medium pb-2">Description</th>
              <th className="font-medium pb-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {payouts.slice(0, 24).map((p) => (
              <tr key={p.id} className="border-t border-ink-100">
                <td className="py-2 text-ink-500 whitespace-nowrap">{shortDate(p.posted_on)}</td>
                <td className="py-2 text-ink-700 truncate max-w-[280px]">
                  <span className="hidden sm:inline">{p.raw_description}</span>
                  <span className="sm:hidden">{p.merchant}</span>
                </td>
                <td className="py-2 text-right tabular-nums font-medium text-accent">
                  +{money(p.amount)}
                </td>
              </tr>
            ))}
            {payouts.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-ink-400 text-sm">
                  No payouts logged yet for this client.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good";
}) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div
        className={`text-2xl font-semibold tabular-nums mt-1 ${
          tone === "good" ? "text-accent" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
