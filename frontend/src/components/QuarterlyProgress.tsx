"use client";

import clsx from "clsx";

import { money, shortDate } from "@/lib/format";
import type { TaxProjection } from "@/lib/api";

const QUARTERLY_DUE_DATES = [
  { label: "Q1", due: "2026-04-15" },
  { label: "Q2", due: "2026-06-15" },
  { label: "Q3", due: "2026-09-15" },
  { label: "Q4", due: "2027-01-15" },
];

/**
 * Visualizes the quarterly 1040-ES pace for the current tax year. The "ring" is
 * actually a horizontal progress bar with each quarter as a notch, but the
 * visual point is the same: are we on track to hit the year's total by Jan 15.
 */
export default function QuarterlyProgress({ tax }: { tax: TaxProjection }) {
  const annual = Number(tax.total_tax_estimate);
  const paid = Number(tax.paid_to_date);
  const today = new Date();
  const dueIso = tax.next_due_date;
  const due = new Date(dueIso);
  const daysUntilDue = Math.max(0, Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  const pctPaid = annual > 0 ? Math.min(1, paid / annual) : 0;

  // Compute which quarters have passed.
  const passed = QUARTERLY_DUE_DATES.map((q) => new Date(q.due).getTime() < today.getTime());
  const onTrackQuarters = passed.filter(Boolean).length;
  const expectedByNow = onTrackQuarters / 4;

  return (
    <div className="card">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <div className="label">Quarterly pacing</div>
          <div className="text-lg font-medium mt-0.5">
            {money(paid)} of {money(annual)} paid this year
          </div>
        </div>
        <div className="text-xs text-ink-400">
          next due in <span className="font-medium text-ink-700">{daysUntilDue}d</span> ·{" "}
          {shortDate(dueIso)}
        </div>
      </div>

      <div className="mt-5">
        <div className="relative h-3 bg-ink-100 rounded-full overflow-hidden">
          <div
            className={clsx(
              "absolute inset-y-0 left-0 transition-all duration-500",
              pctPaid >= expectedByNow ? "bg-accent" : "bg-accent-warn",
            )}
            style={{ width: `${pctPaid * 100}%` }}
          />
          <div
            className="absolute inset-y-0 border-r border-dashed border-ink-400"
            style={{ left: `${expectedByNow * 100}%` }}
          />
        </div>
        <div className="mt-2 grid grid-cols-4 text-[10px] text-ink-400 uppercase tracking-wide">
          {QUARTERLY_DUE_DATES.map((q, i) => (
            <div key={q.label} className={clsx("text-center", passed[i] && "text-ink-600 font-medium")}>
              {q.label}
            </div>
          ))}
        </div>
      </div>

      <p className="subtle mt-3">
        Dashed line is where you should be by today based on the IRS quarterly schedule.
        Above it, you're on safe-harbor pace; below, the next payment needs to be bigger to
        catch up.
      </p>
    </div>
  );
}
