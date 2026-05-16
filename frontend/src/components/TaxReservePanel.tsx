"use client";

import clsx from "clsx";

import { money, percent } from "@/lib/format";
import type { Account, TaxProjection } from "@/lib/api";

/**
 * Tax reserve gap.
 *
 * The single most common 1099 mistake: spending the gross deposit instead of
 * setting aside the tax share. This widget says "you owe X this year, you've
 * paid Y, you have Z in your tax bucket, here's the gap."
 */
export default function TaxReservePanel({
  accounts,
  tax,
}: {
  accounts: Account[];
  tax: TaxProjection;
}) {
  const reserveAccounts = accounts.filter((a) => a.is_tax_reserve);
  const reserveBalance = reserveAccounts.reduce((acc, a) => acc + Number(a.current_balance), 0);

  const annual = Number(tax.total_tax_estimate);
  const paid = Number(tax.paid_to_date);
  const remaining = Math.max(0, annual - paid);
  const gap = remaining - reserveBalance;

  const coverage = remaining > 0 ? Math.min(1, reserveBalance / remaining) : 1;
  const onTrack = gap <= 0;

  return (
    <div className="card">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <div className="label">Tax reserve</div>
          <div className="text-lg font-medium mt-0.5">
            {onTrack ? "Set aside enough to cover this year" : "Catch up before the next quarterly"}
          </div>
        </div>
        <div className="text-xs text-ink-400">
          {reserveAccounts.length > 0
            ? reserveAccounts.map((a) => a.name).join(", ")
            : "No tax-reserve account configured"}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Cell label="Annual tax estimate" value={money(annual)} />
        <Cell label="Paid so far" value={money(paid)} tone="good" />
        <Cell label="In reserve" value={money(reserveBalance)} />
        <Cell
          label={onTrack ? "Buffer" : "Gap to fill"}
          value={money(Math.abs(gap))}
          tone={onTrack ? "good" : "warn"}
        />
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between text-xs text-ink-500">
          <span>Reserve coverage of what's still owed</span>
          <span className="font-medium tabular-nums">{percent(coverage)}</span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-ink-100 overflow-hidden">
          <div
            className={clsx(
              "h-full transition-all duration-500",
              onTrack ? "bg-accent" : "bg-accent-warn",
            )}
            style={{ width: `${coverage * 100}%` }}
          />
        </div>
      </div>

      <p className="subtle mt-4">
        {onTrack ? (
          <>
            You're covered. If income climbs, the gap reopens, so keep an eye on this when a
            big payout lands.
          </>
        ) : (
          <>
            Move <span className="font-medium text-ink-700">{money(Math.abs(gap))}</span>{" "}
            into the reserve before {tax.next_due_date} to be on safe-harbor pace. The
            number adjusts every time you mark a new transaction as business income.
          </>
        )}
      </p>
    </div>
  );
}

function Cell({
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
        className={clsx(
          "text-lg font-semibold tabular-nums mt-0.5",
          tone === "warn" ? "text-accent-warn" : tone === "good" ? "text-accent" : "",
        )}
      >
        {value}
      </div>
    </div>
  );
}
