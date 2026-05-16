"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import clsx from "clsx";

import { api, DEMO_MODE } from "@/lib/api";
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
  const [cursor, setCursor] = useState<number | null>(null);
  const rowRefs = useRef(new Map<number, HTMLElement>());

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

  useEffect(() => {
    setCursor((current) => {
      if (!txs || txs.length === 0) return null;
      if (current != null && txs.some((t) => t.id === current)) return current;
      return txs[0].id;
    });
  }, [txs]);

  async function patch(tx: Transaction, body: Parameters<typeof api.updateTransaction>[1]) {
    await api.updateTransaction(tx.id, body);
    if (DEMO_MODE) {
      // No backend writes: apply the change to the SWR cache so the row reflects the edit immediately.
      const next = (txs || []).map((row) =>
        row.id === tx.id
          ? {
              ...row,
              ...(body?.scope ? { scope: body.scope } : {}),
              ...(body?.category_id ? { category_id: body.category_id } : {}),
              ...("client_id" in (body || {}) ? { client_id: body!.client_id ?? null } : {}),
              user_corrected: true,
            }
          : row,
      );
      await refresh(next, { revalidate: false });
    } else {
      await refresh();
      await mutate("summary");
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Skip when the user is typing in a form control.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      if (!txs || txs.length === 0) return;

      const idx = cursor == null ? -1 : txs.findIndex((t) => t.id === cursor);
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(txs.length - 1, idx + 1);
        const id = txs[next < 0 ? 0 : next].id;
        setCursor(id);
        rowRefs.current.get(id)?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(0, idx - 1);
        const id = txs[next].id;
        setCursor(id);
        rowRefs.current.get(id)?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Escape") {
        setCursor(null);
      } else if ((e.key === "b" || e.key === "p" || e.key === "u") && idx >= 0) {
        e.preventDefault();
        const scope: Scope = e.key === "b" ? "business" : e.key === "p" ? "personal" : "unknown";
        patch(txs[idx], { scope, apply_to_merchant: true });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, cursor]);

  async function runClassifier() {
    setClassifying(true);
    try {
      if (DEMO_MODE) {
        alert(
          "Demo mode: the seed data was pre-classified server-side. In a live deployment this button hits the FastAPI /transactions/classify endpoint, which routes each new merchant through MerchantRule lookup first and Anthropic Claude only on misses.",
        );
        return;
      }
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Transactions</h1>
          <p className="subtle mt-1 max-w-2xl">
            Correct anything that's wrong. The classifier learns from corrections, so each fix is permanent.
          </p>
          <p className="text-xs text-ink-400 mt-2 hidden md:block">
            Shortcuts:{" "}
            <kbd className="px-1.5 py-0.5 bg-ink-100 rounded font-mono text-[10px]">j</kbd>
            <kbd className="px-1.5 py-0.5 bg-ink-100 rounded font-mono text-[10px] ml-1">k</kbd>{" "}
            navigate ·{" "}
            <kbd className="px-1.5 py-0.5 bg-ink-100 rounded font-mono text-[10px]">b</kbd>{" "}
            <kbd className="px-1.5 py-0.5 bg-ink-100 rounded font-mono text-[10px]">p</kbd>{" "}
            <kbd className="px-1.5 py-0.5 bg-ink-100 rounded font-mono text-[10px]">u</kbd>{" "}
            scope · <kbd className="px-1.5 py-0.5 bg-ink-100 rounded font-mono text-[10px]">esc</kbd>{" "}
            clear
          </p>
        </div>
        <button
          onClick={runClassifier}
          disabled={classifying}
          className="px-4 py-2 rounded bg-ink-900 text-white text-sm hover:bg-ink-700 disabled:opacity-40 transition-colors shrink-0 self-start sm:self-auto"
        >
          {classifying ? "Classifying…" : "Classify unreviewed"}
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "needs_review", ...SCOPES] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "px-3 py-1 rounded text-sm border transition-colors",
              filter === f
                ? "bg-ink-900 text-white border-ink-900"
                : "bg-white border-ink-200 text-ink-600 hover:bg-ink-100",
            )}
          >
            {f === "needs_review" ? "Needs review" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="card p-0 overflow-hidden hidden md:block">
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
              <tr
                key={tx.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(tx.id, el);
                  else rowRefs.current.delete(tx.id);
                }}
                onClick={() => setCursor(tx.id)}
                className={clsx(
                  "border-t border-ink-100 transition-colors",
                  cursor === tx.id ? "bg-accent-soft/40" : "hover:bg-ink-50/50",
                )}
              >
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
            {txs && txs.length === 0 && <EmptyRow />}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {txs?.map((tx) => (
          <div
            key={tx.id}
            ref={(el) => {
              if (el) rowRefs.current.set(tx.id, el);
              else rowRefs.current.delete(tx.id);
            }}
            onClick={() => setCursor(tx.id)}
            className={clsx(
              "card p-3 fade-in transition-colors",
              cursor === tx.id && "ring-2 ring-accent",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{tx.merchant}</div>
                <div className="text-xs text-ink-400">{shortDate(tx.posted_on)}</div>
              </div>
              <div
                className={clsx(
                  "tabular-nums font-semibold shrink-0",
                  Number(tx.amount) > 0 ? "text-accent" : "text-ink-700",
                )}
              >
                {Number(tx.amount) > 0 ? "+" : ""}
                {money(tx.amount)}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="label">Scope</div>
                <ScopeSelect
                  tx={tx}
                  onChange={(scope) => patch(tx, { scope, apply_to_merchant: true })}
                />
              </div>
              <div>
                <div className="label">Client</div>
                <ClientSelect
                  tx={tx}
                  clients={clients || []}
                  onChange={(client_id) => patch(tx, { client_id, apply_to_merchant: true })}
                />
              </div>
              <div className="col-span-2">
                <div className="label">Category</div>
                <CategorySelect
                  tx={tx}
                  categories={categories || []}
                  onChange={(category_id) => patch(tx, { category_id, apply_to_merchant: true })}
                />
              </div>
            </div>
            {tx.user_corrected && (
              <div className="text-[10px] text-accent mt-2">user-confirmed → rule</div>
            )}
          </div>
        ))}
        {txs && txs.length === 0 && (
          <div className="card text-center text-ink-400 py-8 text-sm">
            Nothing here. Try a different filter.
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyRow() {
  return (
    <tr>
      <td colSpan={6} className="px-4 py-10 text-center text-ink-400 text-sm">
        <div className="font-medium text-ink-600">All clear.</div>
        <div className="mt-1">Nothing matches that filter. Try another one above.</div>
      </td>
    </tr>
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
        "w-full md:w-auto rounded border border-ink-200 bg-white text-sm px-2 py-1 mt-1 md:mt-0",
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
      className="w-full md:max-w-[180px] rounded border border-ink-200 bg-white text-sm px-2 py-1 mt-1 md:mt-0"
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
      className="w-full md:w-auto rounded border border-ink-200 bg-white text-sm px-2 py-1 mt-1 md:mt-0"
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
