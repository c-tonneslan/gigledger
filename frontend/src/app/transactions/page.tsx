"use client";

import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import clsx from "clsx";

import { api } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import type { Scope, Transaction } from "@/lib/api";

const SCOPES: Scope[] = ["business", "personal", "unknown"];

function ScopePill({ scope }: { scope: Scope }) {
  if (scope === "business") return <span className="pill-business">business</span>;
  if (scope === "personal") return <span className="pill-personal">personal</span>;
  return <span className="pill-unknown">needs review</span>;
}

export default function TransactionsPage() {
  const [filter, setFilter] = useState<Scope | "needs_review" | "all">("all");
  const [classifying, setClassifying] = useState(false);

  const { data: categories } = useSWR("categories", api.categories);
  const { data: clients } = useSWR("clients", api.clients);
  const params = useMemo(() => {
    if (filter === "needs_review") return { needs_review: true, limit: 300 };
    if (filter !== "all") return { scope: filter, limit: 300 };
    return { limit: 300 };
  }, [filter]);

  const { data: txs, mutate: refresh } = useSWR(
    ["transactions", filter],
    () => api.transactions(params),
  );

  async function patch(tx: Transaction, body: Parameters<typeof api.updateTransaction>[1]) {
    await api.updateTransaction(tx.id, body);
    await refresh();
    await mutate("summary");
  }

  async function runClassifier() {
    setClassifying(true);
    try {
      const result = await api.classify(true);
      await refresh();
      await mutate("summary");
      alert(
        `Classified ${result.classified}. ${result.used_rules} via learned merchant rules, ${result.used_llm} via LLM.`,
      );
    } finally {
      setClassifying(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="subtle mt-1">
            Correct anything that's wrong. The classifier learns from corrections, so each fix is permanent.
          </p>
        </div>
        <button
          onClick={runClassifier}
          disabled={classifying}
          className="px-4 py-2 rounded bg-ink-900 text-white text-sm hover:bg-ink-700 disabled:opacity-40"
        >
          {classifying ? "Classifying…" : "Classify unreviewed"}
        </button>
      </div>

      <div className="flex gap-2">
        {(["all", "needs_review", ...SCOPES] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "px-3 py-1 rounded text-sm border",
              filter === f
                ? "bg-ink-900 text-white border-ink-900"
                : "bg-white border-ink-200 text-ink-600 hover:bg-ink-100",
            )}
          >
            {f === "needs_review" ? "Needs review" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-400 text-xs uppercase bg-ink-50">
              <th className="font-medium px-4 py-3">Date</th>
              <th className="font-medium px-4 py-3">Merchant</th>
              <th className="font-medium px-4 py-3 text-right">Amount</th>
              <th className="font-medium px-4 py-3">Scope</th>
              <th className="font-medium px-4 py-3">Category</th>
              <th className="font-medium px-4 py-3">Client</th>
            </tr>
          </thead>
          <tbody>
            {txs?.map((tx) => (
              <tr key={tx.id} className="border-t border-ink-100 hover:bg-ink-50/50">
                <td className="px-4 py-2 whitespace-nowrap text-ink-500">{shortDate(tx.posted_on)}</td>
                <td className="px-4 py-2">
                  <div className="font-medium">{tx.merchant}</div>
                  <div className="text-xs text-ink-400 truncate max-w-[280px]">{tx.raw_description}</div>
                  {tx.llm_confidence && !tx.user_corrected && (
                    <div className="text-[10px] text-ink-400 mt-0.5">
                      llm conf {Number(tx.llm_confidence).toFixed(2)}
                    </div>
                  )}
                  {tx.user_corrected && (
                    <div className="text-[10px] text-accent mt-0.5">user-confirmed → rule</div>
                  )}
                </td>
                <td
                  className={clsx(
                    "px-4 py-2 text-right tabular-nums font-medium",
                    Number(tx.amount) > 0 ? "text-accent" : "text-ink-700",
                  )}
                >
                  {Number(tx.amount) > 0 ? "+" : ""}
                  {money(tx.amount)}
                </td>
                <td className="px-4 py-2">
                  <ScopeSelect tx={tx} onChange={(scope) => patch(tx, { scope, apply_to_merchant: true })} />
                </td>
                <td className="px-4 py-2">
                  <CategorySelect
                    tx={tx}
                    categories={categories || []}
                    onChange={(category_id) =>
                      patch(tx, { category_id, apply_to_merchant: true })
                    }
                  />
                </td>
                <td className="px-4 py-2">
                  <ClientSelect
                    tx={tx}
                    clients={clients || []}
                    onChange={(client_id) => patch(tx, { client_id, apply_to_merchant: true })}
                  />
                </td>
              </tr>
            ))}
            {txs && txs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-400">
                  Nothing here. Try a different filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScopeSelect({
  tx,
  onChange,
}: {
  tx: Transaction;
  onChange: (scope: Scope) => void;
}) {
  return (
    <select
      value={tx.scope}
      onChange={(e) => onChange(e.target.value as Scope)}
      className={clsx(
        "rounded border border-ink-200 bg-white text-sm px-2 py-1",
        tx.scope === "unknown" && "border-accent-warn text-accent-warn",
      )}
    >
      {SCOPES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

function CategorySelect({
  tx,
  categories,
  onChange,
}: {
  tx: Transaction;
  categories: { id: number; name: string }[];
  onChange: (id: number) => void;
}) {
  return (
    <select
      value={tx.category_id ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded border border-ink-200 bg-white text-sm px-2 py-1 max-w-[180px]"
    >
      <option value="" disabled>
        {tx.llm_suggested_category_id ? "suggested…" : "choose"}
      </option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function ClientSelect({
  tx,
  clients,
  onChange,
}: {
  tx: Transaction;
  clients: { id: number; name: string }[];
  onChange: (id: number | null) => void;
}) {
  return (
    <select
      value={tx.client_id ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="rounded border border-ink-200 bg-white text-sm px-2 py-1"
    >
      <option value="">—</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
