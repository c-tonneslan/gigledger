"""Sanity checks against the math I had to do by hand for my own 2025 return.
Not a substitute for a CPA — these pin behavior I care about: SE base rate, wage base,
PA flat rate, Section 179 reducing net income one-for-one.
"""

from datetime import date
from decimal import Decimal

from app.tax import (
    TaxInputs,
    compute_breakdown,
    compute_se_tax,
    federal_income_tax,
    next_quarterly_due,
    quarterly_payment_amount,
    state_income_tax,
)


def test_se_tax_under_wage_base():
    # 100k net, single. Base = 92350. SS portion = 11451.4, Medicare = 2678.15. Total ~14129.55.
    tax, half = compute_se_tax(Decimal("100000"), "single")
    assert Decimal("14000") < tax < Decimal("14200")
    assert half == (tax / 2).quantize(Decimal("0.01"))


def test_se_tax_caps_ss_at_wage_base():
    # Use two points both already over the SS wage base ($181,800 in 2026) so the marginal
    # rate is just Medicare (2.9%) plus Additional Medicare (0.9%) = 3.8% on the SE base.
    low = compute_se_tax(Decimal("250000"), "single")[0]
    high = compute_se_tax(Decimal("350000"), "single")[0]
    delta = high - low
    span = Decimal("350000") - Decimal("250000")
    effective = delta / (span * Decimal("0.9235"))
    assert effective < Decimal("0.04")  # below the full 15.3%, near the medicare-only ceiling


def test_pa_flat_rate():
    assert state_income_tax(Decimal("100000"), "PA") == Decimal("3070.00")


def test_no_income_tax_states():
    assert state_income_tax(Decimal("100000"), "TX") == Decimal("0")
    assert state_income_tax(Decimal("100000"), "FL") == Decimal("0")


def test_section_179_reduces_net_one_for_one():
    base = compute_breakdown(TaxInputs(
        gross_business_income=Decimal("100000"),
        business_expenses=Decimal("10000"),
        section_179=Decimal("0"),
    ))
    with_179 = compute_breakdown(TaxInputs(
        gross_business_income=Decimal("100000"),
        business_expenses=Decimal("10000"),
        section_179=Decimal("5000"),
    ))
    assert with_179.net_se_income == base.net_se_income - Decimal("5000")


def test_quarterly_due_dates():
    assert next_quarterly_due(date(2026, 3, 1)) == ("2026Q1", date(2026, 4, 15))
    assert next_quarterly_due(date(2026, 5, 1)) == ("2026Q2", date(2026, 6, 15))
    assert next_quarterly_due(date(2026, 12, 31))[0] == "2026Q4"


def test_quarterly_payment_credits_prior_payments():
    annual = Decimal("20000")
    # On July 1, Q1 and Q2 are already past. The next payment (Q3) should bring total paid
    # to 3/4 of the annual estimate = 15000. We've paid 4000, so this payment is 11000.
    owed = quarterly_payment_amount(annual, Decimal("4000"), date(2026, 7, 1))
    assert owed == Decimal("11000.00")


def test_federal_tax_progressive():
    low = federal_income_tax(Decimal("50000"), "single")
    high = federal_income_tax(Decimal("200000"), "single")
    assert high > low * 3
