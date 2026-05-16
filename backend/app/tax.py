"""
Tax math for 1099 / self-employed filers.

Numbers here are written for tax year 2026 (filed in 2027). The user filed their own 2025
return so the structure mirrors what they actually went through: Schedule SE for SE tax,
Schedule C for net business income, Section 179 expensing, quarterly 1040-ES estimates,
plus a state add-on (PA defaults to 3.07% flat).

When the IRS publishes finalized 2026 numbers some of these will need a refresh, but the
structure stays the same. Anything that's a placeholder is annotated below.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

# --- 2026 SE tax constants ---------------------------------------------------
# Social Security wage base. IRS publishes this each fall; 168,600 was the 2024
# figure, 176,100 was 2025, so 2026 is projected near $181,800. Use placeholder.
SS_WAGE_BASE_2026 = Decimal("181800.00")
SE_TAX_RATE = Decimal("0.153")          # 12.4% SS + 2.9% Medicare
MEDICARE_ONLY_RATE = Decimal("0.029")   # applied above the SS wage base
SE_INCOME_FACTOR = Decimal("0.9235")    # 92.35% of net is subject to SE tax
SE_DEDUCTION_FACTOR = Decimal("0.5")    # half of SE tax is deductible from AGI

# Additional Medicare for high earners (single threshold; MFJ is 250k)
ADDL_MEDICARE_RATE = Decimal("0.009")
ADDL_MEDICARE_THRESHOLD_SINGLE = Decimal("200000.00")
ADDL_MEDICARE_THRESHOLD_MFJ = Decimal("250000.00")

# --- Federal income tax brackets, 2026 projection (single) ------------------
# These are projected from 2025 with ~3% inflation; replace when IRS publishes finals.
BRACKETS_SINGLE_2026 = [
    (Decimal("0"),      Decimal("11925"),  Decimal("0.10")),
    (Decimal("11925"),  Decimal("48475"),  Decimal("0.12")),
    (Decimal("48475"),  Decimal("103350"), Decimal("0.22")),
    (Decimal("103350"), Decimal("197300"), Decimal("0.24")),
    (Decimal("197300"), Decimal("250525"), Decimal("0.32")),
    (Decimal("250525"), Decimal("626350"), Decimal("0.35")),
    (Decimal("626350"), Decimal("9999999999"), Decimal("0.37")),
]
BRACKETS_MFJ_2026 = [
    (Decimal("0"),      Decimal("23850"),  Decimal("0.10")),
    (Decimal("23850"),  Decimal("96950"),  Decimal("0.12")),
    (Decimal("96950"),  Decimal("206700"), Decimal("0.22")),
    (Decimal("206700"), Decimal("394600"), Decimal("0.24")),
    (Decimal("394600"), Decimal("501050"), Decimal("0.32")),
    (Decimal("501050"), Decimal("751600"), Decimal("0.35")),
    (Decimal("751600"), Decimal("9999999999"), Decimal("0.37")),
]
STANDARD_DEDUCTION_SINGLE_2026 = Decimal("15400")
STANDARD_DEDUCTION_MFJ_2026 = Decimal("30800")

QBI_RATE = Decimal("0.20")  # 199A qualified business income deduction (simplified, ignoring SSTB phaseouts)

# --- State flat rates --------------------------------------------------------
# Only a handful of flat-rate states; everyone else falls back to a rough effective rate.
STATE_FLAT_RATES = {
    "PA": Decimal("0.0307"),
    "IN": Decimal("0.0305"),
    "MI": Decimal("0.0425"),
    "NC": Decimal("0.0425"),
    "UT": Decimal("0.0455"),
    "IL": Decimal("0.0495"),
    "CO": Decimal("0.044"),
    "KY": Decimal("0.04"),
    "MA": Decimal("0.05"),
}
STATE_NO_INCOME_TAX = {"AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY"}
DEFAULT_PROGRESSIVE_EFFECTIVE = Decimal("0.045")  # rough fallback for states we don't model in detail

# --- Quarterly due dates -----------------------------------------------------
# 1040-ES dates for tax year 2026. April / June / September of TY, January of TY+1.
QUARTERLY_DUE_DATES_2026 = [
    ("2026Q1", date(2026, 4, 15)),
    ("2026Q2", date(2026, 6, 15)),
    ("2026Q3", date(2026, 9, 15)),
    ("2026Q4", date(2027, 1, 15)),
]


def _round(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def federal_income_tax(taxable_income: Decimal, filing_status: str) -> Decimal:
    if taxable_income <= 0:
        return Decimal(0)
    brackets = BRACKETS_MFJ_2026 if filing_status == "mfj" else BRACKETS_SINGLE_2026
    owed = Decimal(0)
    for lower, upper, rate in brackets:
        if taxable_income <= lower:
            break
        slice_top = min(taxable_income, upper)
        owed += (slice_top - lower) * rate
        if taxable_income <= upper:
            break
    return _round(owed)


def state_income_tax(taxable_income: Decimal, state: str) -> Decimal:
    state = state.upper()
    if taxable_income <= 0:
        return Decimal(0)
    if state in STATE_NO_INCOME_TAX:
        return Decimal(0)
    rate = STATE_FLAT_RATES.get(state, DEFAULT_PROGRESSIVE_EFFECTIVE)
    return _round(taxable_income * rate)


@dataclass
class TaxInputs:
    gross_business_income: Decimal
    business_expenses: Decimal           # ordinary deductible expenses, excluding 179
    section_179: Decimal                 # full amount expensed this year
    state: str = "PA"
    filing_status: str = "single"        # "single" or "mfj"
    other_w2_income: Decimal = Decimal(0)
    other_withholding: Decimal = Decimal(0)


@dataclass
class TaxBreakdown:
    net_se_income: Decimal
    se_tax: Decimal
    se_tax_deduction: Decimal
    qbi_deduction: Decimal
    taxable_income: Decimal
    federal_income_tax: Decimal
    state_income_tax: Decimal
    total_tax: Decimal
    notes: list[str]


def compute_se_tax(net_se_income: Decimal, filing_status: str) -> tuple[Decimal, Decimal]:
    """Returns (se_tax, deductible_half)."""
    if net_se_income <= 0:
        return Decimal(0), Decimal(0)
    se_base = _round(net_se_income * SE_INCOME_FACTOR)
    if se_base <= 0:
        return Decimal(0), Decimal(0)

    ss_portion = min(se_base, SS_WAGE_BASE_2026) * Decimal("0.124")
    medicare_portion = se_base * Decimal("0.029")
    se_tax = ss_portion + medicare_portion

    # Additional Medicare on SE income over threshold (single only modeled here for clarity)
    threshold = ADDL_MEDICARE_THRESHOLD_MFJ if filing_status == "mfj" else ADDL_MEDICARE_THRESHOLD_SINGLE
    over = max(Decimal(0), se_base - threshold)
    se_tax += over * ADDL_MEDICARE_RATE

    se_tax = _round(se_tax)
    return se_tax, _round(se_tax * SE_DEDUCTION_FACTOR)


def compute_breakdown(inputs: TaxInputs) -> TaxBreakdown:
    notes: list[str] = []

    net_business = inputs.gross_business_income - inputs.business_expenses - inputs.section_179
    if net_business < 0:
        notes.append("Net business income is negative — Schedule C shows a loss this year so far.")
    net_business = _round(net_business)

    se_tax, half_se = compute_se_tax(net_business, inputs.filing_status)

    # Simplified QBI: 20% of qualified business income (after half-SE deduction), capped at 20% of taxable income.
    # Real life this gets ugly with SSTB phaseouts; we keep the simple version and flag it.
    qbi_base = max(Decimal(0), net_business - half_se)
    qbi_deduction = _round(qbi_base * QBI_RATE)
    notes.append("QBI deduction is the simplified 20% calc; the full Section 199A rules with SSTB phaseouts aren't applied here.")

    std_deduction = STANDARD_DEDUCTION_MFJ_2026 if inputs.filing_status == "mfj" else STANDARD_DEDUCTION_SINGLE_2026

    agi = inputs.other_w2_income + net_business - half_se
    taxable_income = max(Decimal(0), _round(agi - std_deduction - qbi_deduction))

    federal = federal_income_tax(taxable_income, inputs.filing_status)
    state = state_income_tax(_round(net_business + inputs.other_w2_income), inputs.state)

    total = se_tax + federal + state - inputs.other_withholding
    total = max(Decimal(0), _round(total))

    return TaxBreakdown(
        net_se_income=net_business,
        se_tax=se_tax,
        se_tax_deduction=half_se,
        qbi_deduction=qbi_deduction,
        taxable_income=taxable_income,
        federal_income_tax=federal,
        state_income_tax=state,
        total_tax=total,
        notes=notes,
    )


def annualize_ytd(ytd_value: Decimal, as_of: date, year_start: date) -> Decimal:
    """Project a YTD figure to a full-year estimate based on days elapsed."""
    days_elapsed = max(1, (as_of - year_start).days + 1)
    return _round(ytd_value * Decimal(365) / Decimal(days_elapsed))


def next_quarterly_due(as_of: date) -> tuple[str, date]:
    for label, due in QUARTERLY_DUE_DATES_2026:
        if as_of <= due:
            return label, due
    # Past Jan 15 of TY+1: point at next year's Q1 placeholder.
    return ("2027Q1", date(2027, 4, 15))


def quarterly_payment_amount(annual_estimate: Decimal, paid_to_date: Decimal, as_of: date) -> Decimal:
    """
    Split the annual estimate into 4 equal quarters, then back out what's already been paid.
    Safe harbor for higher earners (110% of prior year AGI) isn't modeled — this is the
    current-year projection method.
    """
    quarters_passed = sum(1 for _, d in QUARTERLY_DUE_DATES_2026 if d < as_of)
    target_through_now = (annual_estimate / 4) * Decimal(max(1, quarters_passed + 1))
    owed_now = target_through_now - paid_to_date
    return _round(max(Decimal(0), owed_now))
