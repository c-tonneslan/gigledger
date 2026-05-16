"use client";

import { useState } from "react";
import clsx from "clsx";

const DEFINITIONS: Record<string, { title: string; body: string }> = {
  "SE tax": {
    title: "Self-employment tax",
    body: "15.3% (12.4% Social Security + 2.9% Medicare) on 92.35% of your net business income. Above the SS wage base, the 12.4% drops off. The deductible half goes above the line on Schedule 1.",
  },
  "Section 179": {
    title: "Section 179",
    body: "Lets you fully deduct qualifying equipment in the year you buy it, instead of depreciating it over 5-7 years. Most useful when your income is higher this year than next, or when you want the cash-flow benefit now.",
  },
  QBI: {
    title: "Qualified Business Income deduction (Section 199A)",
    body: "Lets pass-through businesses deduct up to 20% of qualified business income. Phaseouts apply over certain income thresholds and for specified service trades (consulting, law, accounting). This dashboard uses the simplified 20% calc.",
  },
  "1040-ES": {
    title: "Form 1040-ES quarterly estimates",
    body: "If you'll owe more than $1,000 at filing time, the IRS expects you to send four roughly-equal estimated payments through the year. Miss them and you owe an underpayment penalty plus interest, even if you settle up in April.",
  },
  "Safe harbor": {
    title: "Safe-harbor rule",
    body: "You avoid the underpayment penalty if you've paid in at least 90% of current-year tax OR 100% of prior-year tax (110% if your AGI was over $150k). This dashboard models the current-year path; switch to prior-year if your income is dropping.",
  },
};

export default function JargonTip({ term, children }: { term: keyof typeof DEFINITIONS; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const def = DEFINITIONS[term];
  if (!def) return <>{children || term}</>;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        className={clsx(
          "underline decoration-dotted underline-offset-2 cursor-help",
          open ? "text-accent" : "text-ink-700 hover:text-accent",
        )}
        aria-expanded={open}
      >
        {children || term}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-30 left-0 top-full mt-1 w-72 rounded-lg border border-ink-200 bg-white p-3 shadow-md text-left text-xs text-ink-700 fade-in"
        >
          <span className="block font-semibold text-ink-900 text-sm">{def.title}</span>
          <span className="block mt-1 leading-relaxed">{def.body}</span>
        </span>
      )}
    </span>
  );
}
