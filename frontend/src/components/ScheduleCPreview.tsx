"use client";

import { money, shortDate } from "@/lib/format";
import type { ScheduleC } from "@/lib/api";

/**
 * Schedule C preview.
 *
 * Not a generated 1040 attachment, a sanity check. Shows what would land on each
 * Schedule C line if the books closed today. Mostly useful right before quarterly
 * payments and right before sending the year-end pack to the CPA.
 */
export default function ScheduleCPreview({ data }: { data: ScheduleC }) {
  const grossNum = Number(data.gross_receipts);
  return (
    <div className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="label">Schedule C preview · tax year {data.year}</div>
          <div className="text-lg font-medium mt-0.5">
            If you closed the books today, here's what the form would say
          </div>
        </div>
        <div className="text-xs text-ink-400">as of {shortDate(data.as_of)}</div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-400 text-xs uppercase border-b border-ink-100">
              <th className="font-medium pb-2">Line</th>
              <th className="font-medium pb-2">Description</th>
              <th className="font-medium pb-2 text-right">Count</th>
              <th className="font-medium pb-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-ink-100">
              <td className="py-2 font-mono text-xs text-ink-500">Part I · 1</td>
              <td className="py-2 font-medium">Gross receipts or sales</td>
              <td className="py-2 text-right text-ink-400">—</td>
              <td className="py-2 text-right tabular-nums font-medium text-accent">
                {money(grossNum)}
              </td>
            </tr>

            <tr>
              <td colSpan={4} className="pt-4 pb-1 text-xs uppercase text-ink-400 tracking-wide">
                Part II · Expenses
              </td>
            </tr>

            {data.expense_lines.map((line) => (
              <tr key={line.category_id} className="border-b border-ink-100">
                <td className="py-2 font-mono text-xs text-ink-500">
                  {line.schedule_c_line || "Part V"}
                </td>
                <td className="py-2">{line.category_name}</td>
                <td className="py-2 text-right text-ink-500 tabular-nums">{line.count}</td>
                <td className="py-2 text-right tabular-nums">{money(line.amount)}</td>
              </tr>
            ))}

            {Number(data.section_179_amount) > 0 && (
              <tr className="border-b border-ink-100 bg-accent-soft/30">
                <td className="py-2 font-mono text-xs text-ink-500">13</td>
                <td className="py-2">
                  <div>Depreciation (Section 179)</div>
                  <div className="text-xs text-ink-400 mt-0.5">
                    Equipment expensed in-year instead of depreciating over 5-7 years
                  </div>
                </td>
                <td className="py-2 text-right text-ink-500">—</td>
                <td className="py-2 text-right tabular-nums">
                  {money(data.section_179_amount)}
                </td>
              </tr>
            )}

            <tr className="border-b-2 border-ink-300">
              <td className="py-2 font-mono text-xs text-ink-500">28</td>
              <td className="py-2 font-medium">Total expenses</td>
              <td className="py-2"></td>
              <td className="py-2 text-right tabular-nums font-medium">
                {money(Number(data.total_expenses) + Number(data.section_179_amount))}
              </td>
            </tr>

            <tr>
              <td className="py-3 font-mono text-xs text-ink-500">31</td>
              <td className="py-3 font-semibold">Net profit (or loss)</td>
              <td className="py-3"></td>
              <td className="py-3 text-right tabular-nums font-semibold text-xl">
                {money(data.net_profit)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="subtle mt-3">
        Line 31 flows to Schedule SE for self-employment tax, then to Schedule 1 for your
        1040. This is a preview, not the form itself, so use it to spot missing categories
        before tax season, not to replace your CPA.
      </p>
    </div>
  );
}
