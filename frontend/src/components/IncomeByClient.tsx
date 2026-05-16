"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { money, monthLabel } from "@/lib/format";
import type { Transaction } from "@/lib/api";

const PALETTE = ["#1f8a5a", "#2fa872", "#f59e0b", "#fb923c", "#8b5cf6", "#0ea5e9", "#5d5d57"];

/**
 * Stacked area of business income by client over time. Same data as the variance
 * chart but broken out, so you can see which client carried which month and
 * which dry spells were really about one client going quiet vs everyone.
 */
export default function IncomeByClient({ transactions }: { transactions: Transaction[] }) {
  const { rows, clientNames } = useMemo(() => {
    const byMonthClient = new Map<string, Map<string, number>>();
    const totals = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.tx_type !== "income" || tx.scope !== "business") continue;
      const month = tx.posted_on.slice(0, 7);
      const client = tx.client_name || "Other";
      const inner = byMonthClient.get(month) || new Map<string, number>();
      inner.set(client, (inner.get(client) || 0) + Number(tx.amount));
      byMonthClient.set(month, inner);
      totals.set(client, (totals.get(client) || 0) + Number(tx.amount));
    }
    const allClients = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
    const months = Array.from(byMonthClient.keys()).sort();
    const rows = months.map((m) => {
      const row: Record<string, string | number> = { month: monthLabel(m) };
      const inner = byMonthClient.get(m)!;
      for (const c of allClients) {
        row[c] = Math.round((inner.get(c) || 0) * 100) / 100;
      }
      return row;
    });
    return { rows, clientNames: allClients };
  }, [transactions]);

  if (rows.length === 0) return null;

  return (
    <div className="card">
      <div className="label">Income by client</div>
      <div className="text-lg font-medium mt-0.5">Where each month's gross actually came from</div>
      <div className="h-64 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows}>
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
              formatter={(value: number, name) => [money(value), name]}
              contentStyle={{ borderRadius: 8, borderColor: "#eeeeec", fontSize: 12 }}
            />
            <Legend
              iconType="square"
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
            {clientNames.map((c, i) => (
              <Area
                key={c}
                type="monotone"
                dataKey={c}
                stackId="1"
                stroke={PALETTE[i % PALETTE.length]}
                fill={PALETTE[i % PALETTE.length]}
                fillOpacity={0.65}
                strokeWidth={1}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
