"use client";

import { useState } from "react";

import { computeBreakdown, effectiveMarginalRate, type FilingStatus } from "@/lib/tax";
import { money, moneyPrecise, percent } from "@/lib/format";
import type { TaxProjection } from "@/lib/api";

type Props = {
  baseline: TaxProjection;
};

/**
 * Section 179 ROI calculator.
 *
 * Most W2 tools tell freelancers "you can deduct equipment" and stop there. The thing
 * that actually matters is the effective cost after the federal + SE + state stack hits.
 * For a typical 1099 filer that's 35-45% off the sticker price.
 */
export default function Section179Calculator({ baseline }: Props) {
  const [price, setPrice] = useState(2999);
  const [businessUse, setBusinessUse] = useState(100);
  const [buyThisYear, setBuyThisYear] = useState(true);

  const net = Number(baseline.net_se_income);
  const filing = (baseline.filing_status as FilingStatus) || "single";
  const state = baseline.state || "PA";

  const deduction = (price * businessUse) / 100;

  const baselineBreakdown = computeBreakdown({
    grossBusinessIncome: Number(baseline.ytd_income),
    businessExpenses: Number(baseline.ytd_business_expenses),
    section179: Number(baseline.ytd_section_179),
    state,
    filingStatus: filing,
  });

  const withDeduction = computeBreakdown({
    grossBusinessIncome: Number(baseline.ytd_income),
    businessExpenses: Number(baseline.ytd_business_expenses),
    section179: Number(baseline.ytd_section_179) + (buyThisYear ? deduction : 0),
    state,
    filingStatus: filing,
  });

  const savings = baselineBreakdown.totalTax - withDeduction.totalTax;
  const fedSavings = baselineBreakdown.federalIncomeTax - withDeduction.federalIncomeTax;
  const seSavings = baselineBreakdown.seTax - withDeduction.seTax;
  const stateSavings = baselineBreakdown.stateIncomeTax - withDeduction.stateIncomeTax;
  const effectiveCost = price - savings;
  const effectiveDiscount = price > 0 ? savings / price : 0;

  const marginal = effectiveMarginalRate(net, state, filing);

  return (
    <div className="card">
      <div className="label">Section 179 calculator</div>
      <div className="text-lg font-medium mt-0.5">
        What does buying this actually cost after the deduction
      </div>
      <p className="subtle mt-1">
        Section 179 lets you expense qualifying equipment in the year you buy it, instead of
        depreciating over 5-7 years. Stack the federal, SE, and {state} savings against the
        sticker price.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
        <label className="block text-sm">
          <span className="label">Equipment price</span>
          <input
            type="number"
            value={price}
            min={0}
            step={50}
            onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
            className="mt-1 w-full rounded border border-ink-200 px-3 py-2 text-sm tabular-nums"
          />
        </label>
        <label className="block text-sm">
          <span className="label">Business use %</span>
          <input
            type="number"
            value={businessUse}
            min={0}
            max={100}
            step={5}
            onChange={(e) =>
              setBusinessUse(Math.max(0, Math.min(100, Number(e.target.value))))
            }
            className="mt-1 w-full rounded border border-ink-200 px-3 py-2 text-sm tabular-nums"
          />
        </label>
        <label className="block text-sm">
          <span className="label">Purchase year</span>
          <select
            value={buyThisYear ? "this" : "next"}
            onChange={(e) => setBuyThisYear(e.target.value === "this")}
            className="mt-1 w-full rounded border border-ink-200 px-3 py-2 text-sm bg-white"
          >
            <option value="this">This year (deduct now)</option>
            <option value="next">Next year (deduct then)</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className="rounded-lg border border-ink-100 bg-ink-50 p-4">
          <div className="label">Effective cost</div>
          <div className="metric mt-1 text-accent">{money(effectiveCost)}</div>
          <div className="subtle mt-1">
            {moneyPrecise(price)} sticker · {percent(effectiveDiscount)} off via tax savings
          </div>
        </div>
        <div className="rounded-lg border border-ink-100 p-4">
          <div className="label">Total tax savings</div>
          <div className="metric mt-1">{money(savings)}</div>
          <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm tabular-nums">
            <dt className="text-ink-400">Federal income tax</dt>
            <dd className="text-right">{money(fedSavings)}</dd>
            <dt className="text-ink-400">Self-employment tax</dt>
            <dd className="text-right">{money(seSavings)}</dd>
            <dt className="text-ink-400">{state} income tax</dt>
            <dd className="text-right">{money(stateSavings)}</dd>
          </dl>
        </div>
      </div>

      <p className="subtle mt-4">
        At your projected net SE income of {money(net)}, your marginal rate stack is{" "}
        <span className="font-medium text-ink-700">
          {percent(marginal.federal)} federal + {percent(marginal.se)} SE + {percent(marginal.state)}{" "}
          {state}
        </span>
        . That's why the effective discount comes out where it does. If you buy after Jan 1
        the same deduction applies to next year's return, which can be the right call if your
        income is climbing and you'd prefer the bigger marginal hit later.
      </p>
    </div>
  );
}
