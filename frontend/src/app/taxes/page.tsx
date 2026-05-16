"use client";

import { useState } from "react";
import useSWR from "swr";

import JargonTip from "@/components/JargonTip";
import ScheduleCPreview from "@/components/ScheduleCPreview";
import Section179Calculator from "@/components/Section179Calculator";
import Stat from "@/components/Stat";
import WhatIfPanel from "@/components/WhatIfPanel";
import { api } from "@/lib/api";
import { money, shortDate } from "@/lib/format";

const STATES = ["PA", "CA", "NY", "TX", "FL", "WA", "MA", "CO", "IL"];

export default function TaxesPage() {
  const [state, setState] = useState("PA");
  const [filing, setFiling] = useState<"single" | "mfj">("single");

  const { data: tax } = useSWR(["tax", state, filing], () =>
    api.taxProjection(state, filing),
  );
  const { data: scheduleC } = useSWR("schedule-c", api.scheduleC);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Taxes</h1>
          <p className="subtle mt-1 max-w-2xl">
            Self-employment tax, federal income, and state, all rolled up into "the number I have to send the IRS this quarter." Plus the full math so you can sanity-check it against your CPA.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="print-hide text-sm px-3 py-1.5 rounded border border-ink-200 hover:bg-ink-100 transition-colors"
        >
          Print / save PDF
        </button>
      </div>

      <div className="flex flex-wrap gap-4 items-end print-hide">
        <div>
          <div className="label mb-1">State</div>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="rounded border border-ink-200 bg-white px-3 py-2 text-sm"
          >
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="label mb-1">Filing status</div>
          <select
            value={filing}
            onChange={(e) => setFiling(e.target.value as "single" | "mfj")}
            className="rounded border border-ink-200 bg-white px-3 py-2 text-sm"
          >
            <option value="single">Single</option>
            <option value="mfj">Married filing jointly</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Stat
          label="Next payment due"
          value={tax ? money(tax.quarterly_payment_due) : "—"}
          hint={tax ? shortDate(tax.next_due_date) : null}
          tone="warn"
        />
        <Stat
          label={<JargonTip term="SE tax">SE tax (annual)</JargonTip>}
          value={tax ? money(tax.se_tax) : "—"}
        />
        <Stat label="Federal income" value={tax ? money(tax.federal_income_tax) : "—"} />
        <Stat label={`${state} income`} value={tax ? money(tax.state_income_tax) : "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <div className="label">Schedule C math (projected)</div>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm tabular-nums">
            <dt className="text-ink-400">Gross 1099 income (YTD)</dt>
            <dd className="text-right">{tax ? money(tax.ytd_income) : "—"}</dd>
            <dt className="text-ink-400">Business expenses (YTD)</dt>
            <dd className="text-right">{tax ? money(tax.ytd_business_expenses) : "—"}</dd>
            <dt className="text-ink-400">Section 179 (YTD)</dt>
            <dd className="text-right">{tax ? money(tax.ytd_section_179) : "—"}</dd>
            <dt className="font-medium border-t border-ink-100 pt-2">
              Projected net SE income (annual)
            </dt>
            <dd className="text-right font-semibold border-t border-ink-100 pt-2">
              {tax ? money(tax.net_se_income) : "—"}
            </dd>
            <dt className="text-ink-400">Total annual tax estimate</dt>
            <dd className="text-right">{tax ? money(tax.total_tax_estimate) : "—"}</dd>
            <dt className="text-ink-400">Paid to date (1040-ES + state)</dt>
            <dd className="text-right">{tax ? money(tax.paid_to_date) : "—"}</dd>
            <dt className="font-medium pt-2">Owed this quarter</dt>
            <dd className="text-right font-semibold pt-2 text-accent-warn">
              {tax ? money(tax.quarterly_payment_due) : "—"}
            </dd>
          </dl>
        </div>

        <div className="card">
          <div className="label">Notes & assumptions</div>
          <ul className="mt-2 space-y-2 text-sm text-ink-600 list-disc list-inside">
            {tax?.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      </div>

      {scheduleC && <ScheduleCPreview data={scheduleC} />}

      <div className="print-hide space-y-6">
      {tax && <Section179Calculator baseline={tax} />}
      {tax && <WhatIfPanel baseline={tax} />}

      </div>

      <div className="card bg-ink-50 print-hide">
        <div className="label">Why this matters</div>
        <p className="text-sm mt-2 text-ink-700">
          Most consumer finance tools assume your employer is already withholding the right
          amount. As a 1099 contractor that's not true; if you wait until April you owe
          ~15% on top of income tax for <JargonTip term="SE tax" /> alone, plus penalties
          for missing the <JargonTip term="1040-ES">quarterly</JargonTip> {" "}
          <JargonTip term="Safe harbor">safe-harbor</JargonTip>. The projection here uses
          your YTD data, annualized, so the number on the dashboard tracks reality as it
          builds.
        </p>
      </div>
    </div>
  );
}
