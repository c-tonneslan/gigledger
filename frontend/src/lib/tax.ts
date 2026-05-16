/**
 * Tax math ported from backend/app/tax.py so calculators can run client-side.
 *
 * The numbers must stay in sync with the Python version. Both use 2026 projected federal
 * brackets and the same SE tax constants. There are tests on the Python side; if you
 * change a constant here, change it there too.
 */

const SS_WAGE_BASE_2026 = 181_800;
const SE_INCOME_FACTOR = 0.9235;
const SE_DEDUCTION_FACTOR = 0.5;
const ADDL_MEDICARE_RATE = 0.009;
const ADDL_MEDICARE_THRESHOLD_SINGLE = 200_000;
const ADDL_MEDICARE_THRESHOLD_MFJ = 250_000;

const BRACKETS_SINGLE_2026: Array<[number, number, number]> = [
  [0, 11925, 0.10],
  [11925, 48475, 0.12],
  [48475, 103350, 0.22],
  [103350, 197300, 0.24],
  [197300, 250525, 0.32],
  [250525, 626350, 0.35],
  [626350, 9_999_999_999, 0.37],
];
const BRACKETS_MFJ_2026: Array<[number, number, number]> = [
  [0, 23850, 0.10],
  [23850, 96950, 0.12],
  [96950, 206700, 0.22],
  [206700, 394600, 0.24],
  [394600, 501050, 0.32],
  [501050, 751600, 0.35],
  [751600, 9_999_999_999, 0.37],
];
const STANDARD_DEDUCTION_SINGLE_2026 = 15400;
const STANDARD_DEDUCTION_MFJ_2026 = 30800;
const QBI_RATE = 0.20;

const STATE_FLAT_RATES: Record<string, number> = {
  PA: 0.0307,
  IN: 0.0305,
  MI: 0.0425,
  NC: 0.0425,
  UT: 0.0455,
  IL: 0.0495,
  CO: 0.044,
  KY: 0.04,
  MA: 0.05,
};
const STATE_NO_INCOME_TAX = new Set(["AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY"]);
const DEFAULT_PROGRESSIVE_EFFECTIVE = 0.045;

export type FilingStatus = "single" | "mfj";

export function federalIncomeTax(taxable: number, filing: FilingStatus): number {
  if (taxable <= 0) return 0;
  const brackets = filing === "mfj" ? BRACKETS_MFJ_2026 : BRACKETS_SINGLE_2026;
  let owed = 0;
  for (const [lo, hi, rate] of brackets) {
    if (taxable <= lo) break;
    const slice = Math.min(taxable, hi);
    owed += (slice - lo) * rate;
    if (taxable <= hi) break;
  }
  return round2(owed);
}

export function stateIncomeTax(taxable: number, state: string): number {
  const s = state.toUpperCase();
  if (taxable <= 0 || STATE_NO_INCOME_TAX.has(s)) return 0;
  const rate = STATE_FLAT_RATES[s] ?? DEFAULT_PROGRESSIVE_EFFECTIVE;
  return round2(taxable * rate);
}

export function seTax(netSeIncome: number, filing: FilingStatus): { tax: number; deductibleHalf: number } {
  if (netSeIncome <= 0) return { tax: 0, deductibleHalf: 0 };
  const seBase = round2(netSeIncome * SE_INCOME_FACTOR);
  if (seBase <= 0) return { tax: 0, deductibleHalf: 0 };

  const ssPortion = Math.min(seBase, SS_WAGE_BASE_2026) * 0.124;
  const medicarePortion = seBase * 0.029;
  let total = ssPortion + medicarePortion;

  const threshold = filing === "mfj" ? ADDL_MEDICARE_THRESHOLD_MFJ : ADDL_MEDICARE_THRESHOLD_SINGLE;
  const over = Math.max(0, seBase - threshold);
  total += over * ADDL_MEDICARE_RATE;

  total = round2(total);
  return { tax: total, deductibleHalf: round2(total * SE_DEDUCTION_FACTOR) };
}

export type Breakdown = {
  netSeIncome: number;
  seTax: number;
  qbiDeduction: number;
  taxableIncome: number;
  federalIncomeTax: number;
  stateIncomeTax: number;
  totalTax: number;
};

export function computeBreakdown(opts: {
  grossBusinessIncome: number;
  businessExpenses: number;
  section179: number;
  state: string;
  filingStatus: FilingStatus;
  otherW2Income?: number;
  otherWithholding?: number;
}): Breakdown {
  const net = round2(opts.grossBusinessIncome - opts.businessExpenses - opts.section179);
  const { tax, deductibleHalf } = seTax(net, opts.filingStatus);

  const qbiBase = Math.max(0, net - deductibleHalf);
  const qbi = round2(qbiBase * QBI_RATE);

  const stdDeduction = opts.filingStatus === "mfj" ? STANDARD_DEDUCTION_MFJ_2026 : STANDARD_DEDUCTION_SINGLE_2026;
  const w2 = opts.otherW2Income ?? 0;
  const withholding = opts.otherWithholding ?? 0;

  const agi = w2 + net - deductibleHalf;
  const taxable = Math.max(0, round2(agi - stdDeduction - qbi));
  const federal = federalIncomeTax(taxable, opts.filingStatus);
  const state = stateIncomeTax(round2(net + w2), opts.state);
  const total = Math.max(0, round2(tax + federal + state - withholding));

  return {
    netSeIncome: net,
    seTax: tax,
    qbiDeduction: qbi,
    taxableIncome: taxable,
    federalIncomeTax: federal,
    stateIncomeTax: state,
    totalTax: total,
  };
}

/**
 * Marginal rate stack a Section 179 deduction can wipe out.
 *
 * This is the most-cited reason 1099 filers care about Section 179: they look at the
 * sticker price of a laptop and forget that the deduction stacks federal + SE + state
 * savings, so the effective cost drops by 35-45% for a typical earner.
 */
export function effectiveMarginalRate(
  netSeIncome: number,
  state: string,
  filingStatus: FilingStatus,
): { federal: number; se: number; state: number; total: number } {
  // Federal: find which bracket the net SE income lands in.
  const brackets = filingStatus === "mfj" ? BRACKETS_MFJ_2026 : BRACKETS_SINGLE_2026;
  const halfSe = seTax(netSeIncome, filingStatus).deductibleHalf;
  const taxableProxy = Math.max(0, netSeIncome - halfSe - (filingStatus === "mfj" ? STANDARD_DEDUCTION_MFJ_2026 : STANDARD_DEDUCTION_SINGLE_2026));
  let federal = 0.10;
  for (const [lo, hi, rate] of brackets) {
    if (taxableProxy > lo && taxableProxy <= hi) {
      federal = rate;
      break;
    }
    if (taxableProxy > hi) federal = rate;
  }

  // SE: 15.3% × 0.9235 of the deduction is removed from the SE base. Effective rate on the deduction
  // depends on whether we're over the SS wage base or not.
  const seBase = netSeIncome * SE_INCOME_FACTOR;
  const seMarginal = seBase > SS_WAGE_BASE_2026 ? 0.029 * 0.9235 : 0.153 * 0.9235;

  const stateRate = stateIncomeTax(10000, state) / 10000; // ratio
  const total = federal + seMarginal + stateRate;
  return { federal, se: seMarginal, state: stateRate, total };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
