"use client";

import { useMemo } from "react";

import { shortDate, money } from "@/lib/format";
import type { Transaction } from "@/lib/api";

type Item = {
  key: string;
  date: string;
  title: string;
  detail: string;
  tone: "rule" | "payout" | "expense" | "section179";
};

const TONE_COLOR: Record<Item["tone"], string> = {
  rule: "bg-accent-soft text-accent",
  payout: "bg-accent-soft text-accent",
  expense: "bg-ink-100 text-ink-700",
  section179: "bg-accent-warnSoft text-accent-warn",
};

const TONE_LABEL: Record<Item["tone"], string> = {
  rule: "Rule",
  payout: "Payout",
  expense: "Expense",
  section179: "Section 179",
};

/**
 * Activity feed.
 *
 * Surfaces the last few interesting things in the ledger so the dashboard has a "what
 * changed recently" beat. Picks the biggest payouts, the biggest single expenses, any
 * Section 179 events, and the most recently user-corrected transactions (rule learning).
 */
export default function ActivityFeed({ transactions }: { transactions: Transaction[] }) {
  const items = useMemo<Item[]>(() => {
    if (!transactions.length) return [];

    const out: Item[] = [];

    const recentCorrections = transactions
      .filter((t) => t.user_corrected)
      .sort((a, b) => (a.posted_on > b.posted_on ? -1 : 1))
      .slice(0, 2);
    for (const tx of recentCorrections) {
      out.push({
        key: `rule-${tx.id}`,
        date: tx.posted_on,
        title: `Learned rule from ${tx.merchant}`,
        detail: `Future ${tx.merchant} charges auto-tag as ${tx.category_name || "uncategorized"} · ${tx.scope}`,
        tone: "rule",
      });
    }

    const recentBigPayouts = transactions
      .filter((t) => t.tx_type === "income" && t.scope === "business" && Number(t.amount) > 0)
      .sort((a, b) => (a.posted_on > b.posted_on ? -1 : 1))
      .slice(0, 3);
    for (const tx of recentBigPayouts) {
      out.push({
        key: `pay-${tx.id}`,
        date: tx.posted_on,
        title: `${tx.merchant} paid ${money(tx.amount)}`,
        detail: tx.client_name ? `Logged against ${tx.client_name}` : "Unassigned client",
        tone: "payout",
      });
    }

    const recentS179 = transactions
      .filter((t) => Number(t.section_179_amount) > 0)
      .sort((a, b) => (a.posted_on > b.posted_on ? -1 : 1))
      .slice(0, 1);
    for (const tx of recentS179) {
      out.push({
        key: `s179-${tx.id}`,
        date: tx.posted_on,
        title: `${tx.merchant} — Section 179 candidate`,
        detail: `${money(tx.section_179_amount)} expensed in-year instead of depreciated`,
        tone: "section179",
      });
    }

    const recentBigExpenses = transactions
      .filter((t) => t.tx_type === "expense" && t.scope === "business")
      .sort((a, b) => Number(a.amount) - Number(b.amount))
      .slice(0, 2);
    for (const tx of recentBigExpenses) {
      out.push({
        key: `exp-${tx.id}`,
        date: tx.posted_on,
        title: `${tx.merchant} — ${money(Math.abs(Number(tx.amount)))}`,
        detail: tx.category_name || "Uncategorized",
        tone: "expense",
      });
    }

    out.sort((a, b) => (a.date > b.date ? -1 : 1));
    return out.slice(0, 6);
  }, [transactions]);

  if (items.length === 0) return null;

  return (
    <div className="card">
      <div className="label">Recent activity</div>
      <div className="text-lg font-medium mt-0.5 mb-4">
        What changed in the ledger lately
      </div>
      <ol className="space-y-3 text-sm">
        {items.map((item) => (
          <li key={item.key} className="flex gap-3 items-start">
            <span
              className={`pill shrink-0 ${TONE_COLOR[item.tone]}`}
              style={{ minWidth: "5.5rem", justifyContent: "center" }}
            >
              {TONE_LABEL[item.tone]}
            </span>
            <div className="min-w-0">
              <div className="font-medium truncate">{item.title}</div>
              <div className="text-xs text-ink-500 mt-0.5">
                {shortDate(item.date)} · {item.detail}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
