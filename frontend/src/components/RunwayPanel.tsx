import { money } from "@/lib/format";
import type { Variance } from "@/lib/api";

export default function RunwayPanel({ data }: { data: Variance }) {
  return (
    <div className="card">
      <div className="label">Runway under different scenarios</div>
      <div className="mt-1 text-lg font-medium">
        Cash on hand: <span className="tabular-nums">{money(data.cash_on_hand)}</span>
      </div>
      <div className="mt-4 space-y-3">
        {data.scenarios.map((s) => (
          <div key={s.name} className="flex items-center justify-between text-sm">
            <div>
              <div className="font-medium">{s.name}</div>
              <div className="text-ink-400 text-xs">monthly burn {money(s.monthly_burn)}</div>
            </div>
            <div className="tabular-nums text-right">
              <div className="text-xl font-semibold">{Number(s.months_of_runway) >= 99 ? "∞" : `${s.months_of_runway} mo`}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="subtle mt-4">
        The "worst-month repeats" line is the honest one. If your slowest month becomes your average month, this is how long the savings hold up.
      </p>
    </div>
  );
}
