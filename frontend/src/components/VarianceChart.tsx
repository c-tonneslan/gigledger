"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { money, monthLabel } from "@/lib/format";
import type { Variance } from "@/lib/api";

const FORECAST_MONTHS = 3;

type Row = {
  month: string;
  net?: number;
  rolling?: number;
  forecast?: number;
  isForecast: boolean;
};

/**
 * Build a naive forecast: hold the rolling 90-day average flat for the next few months.
 * Stated as a flat extrapolation, not a model. The variance number tells the viewer how
 * much to trust it.
 */
function buildRows(data: Variance): Row[] {
  const history: Row[] = data.points.map((p) => ({
    month: monthLabel(p.month),
    net: Number(p.net_income),
    rolling: Number(p.rolling_90d_avg),
    isForecast: false,
  }));

  if (history.length === 0) return history;

  const lastPoint = data.points[data.points.length - 1];
  const lastRolling = Number(lastPoint.rolling_90d_avg);

  const [lastYearStr, lastMonthStr] = lastPoint.month.split("-");
  let year = Number(lastYearStr);
  let month = Number(lastMonthStr);

  // Make the last historical bucket also carry the forecast value so the line connects.
  history[history.length - 1].forecast = lastRolling;

  const forecast: Row[] = [];
  for (let i = 0; i < FORECAST_MONTHS; i++) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const iso = `${year}-${String(month).padStart(2, "0")}`;
    forecast.push({
      month: monthLabel(iso),
      forecast: lastRolling,
      isForecast: true,
    });
  }

  return [...history, ...forecast];
}

export default function VarianceChart({ data }: { data: Variance }) {
  const rows = buildRows(data);
  const lastHistoryIndex = data.points.length - 1;
  const forecastStartLabel = rows[lastHistoryIndex]?.month;

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="label">Income volatility</div>
          <div className="text-lg font-medium mt-0.5">
            Monthly business net, rolling 90-day average, and 3-month forecast
          </div>
        </div>
        <div className="text-xs text-ink-400">
          stddev {money(data.rolling_90d_stddev)} · worst {money(data.worst_month_net)} · best {money(data.best_month_net)}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows}>
            <CartesianGrid stroke="#eeeeec" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => money(Number(v))}
              tickLine={false}
              axisLine={false}
              width={70}
            />
            <Tooltip
              formatter={(value: number, key) => {
                const label =
                  key === "net" ? "Net" : key === "rolling" ? "Rolling avg" : "Forecast";
                return [money(value), label];
              }}
              labelStyle={{ color: "#3d3d38" }}
              contentStyle={{ borderRadius: 8, borderColor: "#eeeeec" }}
            />
            {forecastStartLabel && (
              <ReferenceLine
                x={forecastStartLabel}
                stroke="#b8b8b1"
                strokeDasharray="2 4"
                label={{ value: "today", position: "top", fill: "#878781", fontSize: 10 }}
              />
            )}
            <Area type="monotone" dataKey="net" stroke="#1f8a5a" fill="#dbf3e4" strokeWidth={2} />
            <Line
              type="monotone"
              dataKey="rolling"
              stroke="#1c1c19"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 4"
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#5d5d57"
              strokeWidth={2}
              dot={{ r: 3, fill: "#5d5d57" }}
              strokeDasharray="2 3"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="subtle mt-3">
        Forecast holds the rolling 90-day average flat going forward. With{" "}
        {money(data.rolling_90d_stddev)} of monthly stddev, treat the line as a center
        guess, not a guarantee. Quarterly tax estimates assume something like this baseline.
      </p>
    </div>
  );
}
