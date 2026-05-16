"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { money } from "@/lib/format";
import type { Transaction } from "@/lib/api";

// Reuse palette: greens for biggest, then warm tones, then neutral.
const COLORS = ["#1f8a5a", "#2fa872", "#86c89d", "#f59e0b", "#fb923c", "#c2410c", "#5d5d57", "#878781"];

type Slice = { name: string; value: number };

export default function SpendingBreakdown({ transactions }: { transactions: Transaction[] }) {
  const slices = useMemo<Slice[]>(() => {
    const byCategory = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.tx_type !== "expense") continue;
      if (tx.scope !== "business") continue;
      const name = tx.category_name || "Uncategorized";
      // Strip out the non-operating buckets so this reads as "where is the business spending."
      if (name === "Estimated Taxes Paid" || name === "Retirement (SEP-IRA)") continue;
      byCategory.set(name, (byCategory.get(name) || 0) + Math.abs(Number(tx.amount)));
    }
    const all: Slice[] = Array.from(byCategory.entries()).map(([name, value]) => ({ name, value }));
    all.sort((a, b) => b.value - a.value);
    // Roll everything past 6 categories into "Other" so the donut stays readable.
    if (all.length <= 7) return all;
    const top = all.slice(0, 6);
    const other = all.slice(6).reduce((acc, s) => acc + s.value, 0);
    return [...top, { name: "Other", value: other }];
  }, [transactions]);

  const total = slices.reduce((acc, s) => acc + s.value, 0);

  if (total === 0) {
    return null;
  }

  return (
    <div className="card">
      <div className="label">Where the business is spending</div>
      <div className="text-lg font-medium mt-0.5">Year-to-date deductible expenses by category</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 items-center">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="92%"
                strokeWidth={0}
              >
                {slices.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [money(value), name]}
                contentStyle={{ borderRadius: 8, borderColor: "#eeeeec", fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div>
          <div className="text-sm">
            <div className="label">Total deductible</div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">{money(total)}</div>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {slices.map((s, i) => {
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              return (
                <li key={s.name} className="flex items-center gap-3">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="tabular-nums text-ink-500 w-12 text-right text-xs">
                    {pct.toFixed(0)}%
                  </span>
                  <span className="tabular-nums w-20 text-right font-medium">{money(s.value)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
