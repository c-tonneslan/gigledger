"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { money, monthLabel } from "@/lib/format";
import type { Variance } from "@/lib/api";

export default function VarianceChart({ data }: { data: Variance }) {
  const rows = data.points.map((p) => ({
    month: monthLabel(p.month),
    net: Number(p.net_income),
    rolling: Number(p.rolling_90d_avg),
  }));

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="label">Income volatility</div>
          <div className="text-lg font-medium mt-0.5">Monthly business net & rolling 90-day avg</div>
        </div>
        <div className="text-xs text-ink-400">
          stddev {money(data.rolling_90d_stddev)} · worst {money(data.worst_month_net)} · best {money(data.best_month_net)}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows}>
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
              formatter={(value: number) => money(value)}
              labelStyle={{ color: "#3d3d38" }}
              contentStyle={{ borderRadius: 8, borderColor: "#eeeeec" }}
            />
            <Area type="monotone" dataKey="net" stroke="#1f8a5a" fill="#dbf3e4" strokeWidth={2} />
            <Line type="monotone" dataKey="rolling" stroke="#1c1c19" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
