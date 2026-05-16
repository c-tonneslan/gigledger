import Link from "next/link";
import clsx from "clsx";

import { money, moneyPrecise } from "@/lib/format";
import type { HourlyRate } from "@/lib/api";

export default function HourlyRateTable({
  rates,
  linkable = false,
}: {
  rates: HourlyRate[];
  linkable?: boolean;
}) {
  return (
    <div className="card">
      <div className="label">Effective hourly rate by client (last 12 months)</div>
      <div className="text-lg font-medium mt-0.5 mb-4">What you actually earn after platform fees</div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-400 text-xs uppercase">
              <th className="font-medium pb-2">Client</th>
              <th className="font-medium pb-2 text-right">Gross</th>
              <th className="font-medium pb-2 text-right">Hours</th>
              <th className="font-medium pb-2 text-right">Quoted</th>
              <th className="font-medium pb-2 text-right">Effective</th>
              <th className="font-medium pb-2 text-right">Delta</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => {
              const quoted = r.quoted_rate ? Number(r.quoted_rate) : null;
              const effective = r.effective_rate ? Number(r.effective_rate) : null;
              const delta = quoted && effective ? effective - quoted : null;
              return (
                <tr key={r.client_id} className="border-t border-ink-100">
                  <td className="py-2 font-medium">
                    {linkable ? (
                      <Link className="link" href={`/clients/${r.client_id}`}>
                        {r.client_name}
                      </Link>
                    ) : (
                      r.client_name
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{money(r.gross_income)}</td>
                  <td className="py-2 text-right tabular-nums">{Number(r.hours).toFixed(1)}</td>
                  <td className="py-2 text-right tabular-nums text-ink-400">
                    {quoted ? moneyPrecise(quoted) : "-"}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {effective ? moneyPrecise(effective) : "-"}
                  </td>
                  <td
                    className={clsx(
                      "py-2 text-right tabular-nums",
                      delta == null ? "text-ink-400" : delta < 0 ? "text-accent-warn" : "text-accent",
                    )}
                  >
                    {delta == null ? "-" : `${delta < 0 ? "" : "+"}${moneyPrecise(delta)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <ul className="md:hidden space-y-3">
        {rates.map((r) => {
          const quoted = r.quoted_rate ? Number(r.quoted_rate) : null;
          const effective = r.effective_rate ? Number(r.effective_rate) : null;
          const delta = quoted && effective ? effective - quoted : null;
          return (
            <li key={r.client_id} className="rounded-lg border border-ink-100 p-3">
              <div className="flex items-baseline justify-between">
                <div className="font-medium">
                  {linkable ? (
                    <Link className="link" href={`/clients/${r.client_id}`}>
                      {r.client_name}
                    </Link>
                  ) : (
                    r.client_name
                  )}
                </div>
                <div className="text-right tabular-nums">
                  <div className="text-lg font-semibold">
                    {effective ? moneyPrecise(effective) : "-"}
                  </div>
                  <div className="text-xs text-ink-400">effective</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-ink-500">
                <div>
                  <div className="text-ink-400">Gross</div>
                  <div className="tabular-nums font-medium text-ink-700">{money(r.gross_income)}</div>
                </div>
                <div>
                  <div className="text-ink-400">Hours</div>
                  <div className="tabular-nums font-medium text-ink-700">
                    {Number(r.hours).toFixed(0)}
                  </div>
                </div>
                <div>
                  <div className="text-ink-400">Delta</div>
                  <div
                    className={clsx(
                      "tabular-nums font-medium",
                      delta == null ? "text-ink-400" : delta < 0 ? "text-accent-warn" : "text-accent",
                    )}
                  >
                    {delta == null ? "-" : `${delta < 0 ? "" : "+"}${moneyPrecise(delta)}`}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="subtle mt-4">
        Delta is effective minus quoted. Negative numbers mean fees, slow payouts, or unbilled hours
        are eating into the headline rate.
      </p>
    </div>
  );
}
