from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models import Category, EstimatedPayment, Transaction, TxScope, TxType
from ..schemas import EstimatedPaymentCreate, EstimatedPaymentOut, TaxProjection
from ..tax import (
    TaxInputs,
    annualize_ytd,
    compute_breakdown,
    next_quarterly_due,
    quarterly_payment_amount,
)

router = APIRouter(prefix="/taxes", tags=["taxes"])


@router.get("/projection", response_model=TaxProjection)
def projection(
    db: Session = Depends(get_db),
    state: Optional[str] = None,
    filing_status: Optional[str] = None,
):
    settings = get_settings()
    state = (state or settings.user_state).upper()
    filing_status = (filing_status or settings.user_filing_status).lower()

    today = date.today()
    year_start = date(today.year, 1, 1)

    txs = list(db.scalars(select(Transaction).where(Transaction.posted_on >= year_start)))

    estimated_taxes_cat = db.scalar(select(Category).where(Category.name == "Estimated Taxes Paid"))
    retirement_cat = db.scalar(select(Category).where(Category.name == "Retirement (SEP-IRA)"))
    excluded_ids = {c.id for c in (estimated_taxes_cat, retirement_cat) if c}

    ytd_income = sum(
        (Decimal(t.amount) for t in txs
         if t.tx_type == TxType.income and t.scope == TxScope.business),
        Decimal(0),
    )
    ytd_expenses = sum(
        (abs(Decimal(t.amount)) for t in txs
         if t.tx_type == TxType.expense
         and t.scope == TxScope.business
         and t.category_id not in excluded_ids
         and Decimal(t.section_179_amount) == 0),
        Decimal(0),
    )
    ytd_s179 = sum((Decimal(t.section_179_amount) for t in txs), Decimal(0))

    # Project to full-year before computing tax. Otherwise quarterly payments based on YTD-only undershoot.
    annual_income = annualize_ytd(ytd_income, today, year_start)
    annual_expenses = annualize_ytd(ytd_expenses, today, year_start)
    # Section 179 is event-driven; don't annualize it.
    annual_s179 = ytd_s179

    breakdown = compute_breakdown(
        TaxInputs(
            gross_business_income=annual_income,
            business_expenses=annual_expenses,
            section_179=annual_s179,
            state=state,
            filing_status=filing_status,
        )
    )

    paid_records = list(db.scalars(select(EstimatedPayment).where(EstimatedPayment.paid_on >= year_start)))
    paid_to_date = sum(
        (Decimal(p.federal_amount) + Decimal(p.state_amount) for p in paid_records),
        Decimal(0),
    )

    label, due = next_quarterly_due(today)
    quarterly = quarterly_payment_amount(breakdown.total_tax, paid_to_date, today)

    notes = list(breakdown.notes)
    if state == "PA":
        notes.append("PA state tax is 3.07% flat on net business income (PA-40 Schedule C basis).")
    notes.append(f"Annual figures projected from {ytd_income:.0f} YTD income annualized to {annual_income:.0f}.")
    notes.append(f"Safe-harbor 110% prior-year method is not modeled — projection uses current-year estimate only.")

    return TaxProjection(
        ytd_income=ytd_income.quantize(Decimal("0.01")),
        ytd_business_expenses=ytd_expenses.quantize(Decimal("0.01")),
        ytd_section_179=ytd_s179.quantize(Decimal("0.01")),
        net_se_income=breakdown.net_se_income,
        se_tax=breakdown.se_tax,
        federal_income_tax=breakdown.federal_income_tax,
        state_income_tax=breakdown.state_income_tax,
        total_tax_estimate=breakdown.total_tax,
        safe_harbor_target=breakdown.total_tax,
        quarterly_payment_due=quarterly,
        next_due_date=due,
        paid_to_date=paid_to_date.quantize(Decimal("0.01")),
        state=state,
        filing_status=filing_status,
        notes=notes,
    )


@router.get("/payments", response_model=list[EstimatedPaymentOut])
def list_payments(db: Session = Depends(get_db)):
    return list(db.scalars(select(EstimatedPayment).order_by(EstimatedPayment.paid_on.desc())))


@router.post("/payments", response_model=EstimatedPaymentOut)
def record_payment(payload: EstimatedPaymentCreate, db: Session = Depends(get_db)):
    p = EstimatedPayment(**payload.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p
