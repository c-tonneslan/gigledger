"use client";

import useSWR from "swr";

import HourlyRateTable from "@/components/HourlyRateTable";
import RunwayPanel from "@/components/RunwayPanel";
import { CardSkeleton, StatSkeleton } from "@/components/Skeleton";
import SpendingBreakdown from "@/components/SpendingBreakdown";
import Stat from "@/components/Stat";
import VarianceChart from "@/components/VarianceChart";
import { api } from "@/lib/api";
import { money, shortDate } from "@/lib/format";

export default function DashboardPage() {
  const { data: summary } = useSWR("summary", api.summary);
  const { data: variance } = useSWR("variance", () => api.variance(12));
  const { data: rates } = useSWR("rates", () => api.hourlyRates(365));
  const { data: tax } = useSWR("tax", () => api.taxProjection());
  const { data: txs } = useSWR("txs-dashboard", () => api.transactions({ limit: 300 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="subtle mt-1 max-w-2xl">
          Built from the headaches of actually filing my own 2025 return with 1099-NEC income,
          Section 179, and Q1 2026 estimates. The math here is the math I had to do anyway.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {summary ? (
          <Stat
            label="YTD business income"
            value={money(summary.income)}
            hint={`${summary.transaction_count} transactions in window`}
          />
        ) : (
          <StatSkeleton />
        )}
        {summary ? (
          <Stat
            label="Net after expenses"
            value={money(summary.net_business_income)}
            hint={`expenses ${money(summary.business_expenses)}`}
            tone="good"
          />
        ) : (
          <StatSkeleton />
        )}
        {tax ? (
          <Stat
            label="Next quarterly payment"
            value={money(tax.quarterly_payment_due)}
            hint={`due ${shortDate(tax.next_due_date)} · ${tax.state}`}
            tone="warn"
          />
        ) : (
          <StatSkeleton />
        )}
        {summary ? (
          <Stat
            label="Section 179 YTD"
            value={money(summary.section_179_ytd)}
            hint="equipment expensed in-year"
          />
        ) : (
          <StatSkeleton />
        )}
      </div>

      {summary && summary.needs_review_count > 0 && (
        <div className="card border-l-4 border-accent-warn">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="label">Inbox</div>
              <div className="text-lg font-medium mt-0.5">
                {summary.needs_review_count} transactions waiting for review
              </div>
              <p className="subtle mt-1">
                Classify a few and the next batch lands instantly, no LLM call needed.
              </p>
            </div>
            <a className="link text-sm" href="/transactions?needs_review=true">
              Open inbox →
            </a>
          </div>
        </div>
      )}

      {variance ? <VarianceChart data={variance} /> : <CardSkeleton />}

      {txs && <SpendingBreakdown transactions={txs} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {variance && <RunwayPanel data={variance} />}
        {tax && (
          <div className="card">
            <div className="label">Tax projection ({tax.state} · {tax.filing_status})</div>
            <div className="text-lg font-medium mt-0.5">If income holds at this pace</div>
            <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm tabular-nums">
              <dt className="text-ink-400">Net SE income</dt>
              <dd className="text-right">{money(tax.net_se_income)}</dd>
              <dt className="text-ink-400">Self-employment tax</dt>
              <dd className="text-right">{money(tax.se_tax)}</dd>
              <dt className="text-ink-400">Federal income tax</dt>
              <dd className="text-right">{money(tax.federal_income_tax)}</dd>
              <dt className="text-ink-400">{tax.state} income tax</dt>
              <dd className="text-right">{money(tax.state_income_tax)}</dd>
              <dt className="font-medium border-t border-ink-100 pt-2">Total annual estimate</dt>
              <dd className="text-right font-semibold border-t border-ink-100 pt-2">
                {money(tax.total_tax_estimate)}
              </dd>
              <dt className="text-ink-400">Paid so far this year</dt>
              <dd className="text-right">{money(tax.paid_to_date)}</dd>
            </dl>
            <p className="subtle mt-3">
              SE tax is 15.3% of 92.35% of net business income up to the SS wage base, plus 2.9% Medicare on the rest. The first thing freelancers miss when they only set aside "income tax."
            </p>
          </div>
        )}
      </div>

      {rates && <HourlyRateTable rates={rates} />}
    </div>
  );
}
