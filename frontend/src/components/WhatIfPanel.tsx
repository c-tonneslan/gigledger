"use client";

import { useMemo, useState } from "react";

import { computeBreakdown, type FilingStatus } from "@/lib/tax";
import { money } from "@/lib/format";
import type { TaxProjection } from "@/lib/api";

type Props = {
  baseline: TaxProjection;
};

/**
 * What-if income panel.
 *
 * Real freelancer question: "I'm about to close a $25k consulting gig in October. What
 * does that do to my quarterly bill?" The point of this panel is to give a number in
 * under 3 seconds, without the user having to project full-year income themselves.
 */
export default function WhatIfPanel({ baseline }: Props) {
  const [extraIncome, setExtraIncome] = useState(0);
  const [extraExpenses, setExtraExpenses] = useState(0);

  const filing = (baseline.filing_status as FilingStatus) || "single";
  const state = baseline.state || "PA";

  const projection = useMemo(() => {
    // Baseline annualized totals (from the server projection) plus the user's delta.
    // We recompute the full breakdown so the marginal effect is correct.
    const baselineAnnual = computeBreakdown({
      grossBusinessIncome: Number(baseline.ytd_income),
      businessExpenses: Number(baseline.ytd_business_expenses),
      section179: Number(baseline.ytd_section_179),
      state,
      filingStatus: filing,
    });
    const withDelta = computeBreakdown({
      grossBusinessIncome: Number(baseline.ytd_income) + extraIncome,
      businessExpenses: Number(baseline.ytd_business_expenses) + extraExpenses,
      section179: Number(baseline.ytd_section_179),
      state,
      filingStatus: filing,
    });

    const taxDelta = withDelta.totalTax - baselineAnnual.totalTax;
    const netAfterTax = extraIncome - extraExpenses - taxDelta;
    const takeHomeRate = extraIncome > 0 ? netAfterTax / extraIncome : 0;

    return {
      baseline: baselineAnnual,
      withDelta,
      taxDelta,
      netAfterTax,
      takeHomeRate,
    };
  }, [baseline, extraIncome, extraExpenses, filing, state]);

  return (
    <div className="card">
      <div className="label">What if</div>
      <div className="text-lg font-medium mt-0.5">Project a new contract or unexpected expense</div>
      <p className="subtle mt-1">
        See how an additional gig (or write-off) shifts your total tax bill before you sign
        anything. The numbers update in real time and account for the SE tax, federal, and{" "}
        {state} stack.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        <label className="block text-sm">
          <span className="label">Extra business income</span>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={75000}
              step={500}
              value={extraIncome}
              onChange={(e) => setExtraIncome(Number(e.target.value))}
              className="flex-1"
            />
            <input
              type="number"
              value={extraIncome}
              min={0}
              step={500}
              onChange={(e) => setExtraIncome(Math.max(0, Number(e.target.value)))}
              className="w-28 rounded border border-ink-200 px-2 py-1 text-sm tabular-nums text-right"
            />
          </div>
        </label>
        <label className="block text-sm">
          <span className="label">Extra deductible expenses</span>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={20000}
              step={250}
              value={extraExpenses}
              onChange={(e) => setExtraExpenses(Number(e.target.value))}
              className="flex-1"
            />
            <input
              type="number"
              value={extraExpenses}
              min={0}
              step={250}
              onChange={(e) => setExtraExpenses(Math.max(0, Number(e.target.value)))}
              className="w-28 rounded border border-ink-200 px-2 py-1 text-sm tabular-nums text-right"
            />
          </div>
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        <Stat label="Extra tax owed" value={money(projection.taxDelta)} tone="warn" />
        <Stat label="Net take-home" value={money(projection.netAfterTax)} tone="good" />
        <Stat
          label="Effective take-home rate"
          value={extraIncome > 0 ? `${(projection.takeHomeRate * 100).toFixed(1)}%` : "—"}
        />
        <Stat label="New total tax" value={money(projection.withDelta.totalTax)} />
      </div>

      <p className="subtle mt-4">
        The take-home rate is the part most freelancers miss. On the next $1 of business
        income you're paying federal income tax, your full SE rate, and {state} tax, all
        before you see a cent. Knowing the number ahead of time changes which contracts you
        sign and how you negotiate rate.
      </p>
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
  tone?: "warn" | "good";
}) {
  return (
    <div className="rounded-lg border border-ink-100 p-3">
      <div className="label">{label}</div>
      <div
        className={`text-xl font-semibold tabular-nums mt-0.5 ${
          tone === "warn" ? "text-accent-warn" : tone === "good" ? "text-accent" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
