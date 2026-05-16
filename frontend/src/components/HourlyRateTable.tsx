import clsx from "clsx";

import { money, moneyPrecise } from "@/lib/format";
import type { HourlyRate } from "@/lib/api";

export default function HourlyRateTable({ rates }: { rates: HourlyRate[] }) {
  return (
    <div className="card">
      <div className="label">Effective hourly rate by client (last 12 months)</div>
      <div className="text-lg font-medium mt-0.5 mb-3">What you actually earn after platform fees</div>
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
                <td className="py-2 font-medium">{r.client_name}</td>
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
                  {delta == null
                    ? "-"
                    : `${delta < 0 ? "" : "+"}${moneyPrecise(delta)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="subtle mt-3">
        Delta is effective minus quoted. Negative numbers mean fees, slow payouts, or unbilled hours are eating into the headline rate.
      </p>
    </div>
  );
}
