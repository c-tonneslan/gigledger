from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from .models import TxScope, TxType


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    institution: str
    mask: str
    is_business: bool
    is_tax_reserve: bool = False
    current_balance: Decimal


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    platform: Optional[str] = None
    default_hourly_rate: Optional[Decimal] = None


class ClientCreate(BaseModel):
    name: str
    platform: Optional[str] = None
    default_hourly_rate: Optional[Decimal] = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    schedule_c_line: Optional[str] = None
    is_section_179_eligible: bool
    deductible: bool


class EngagementCreate(BaseModel):
    client_id: int
    worked_on: date
    hours: Decimal
    description: Optional[str] = None


class EngagementOut(EngagementCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    account_id: int
    posted_on: date
    amount: Decimal
    merchant: str
    raw_description: str
    tx_type: TxType
    scope: TxScope
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    client_id: Optional[int] = None
    client_name: Optional[str] = None
    section_179_amount: Decimal
    business_use_pct: Decimal
    llm_suggested_category_id: Optional[int] = None
    llm_suggested_scope: Optional[TxScope] = None
    llm_confidence: Optional[Decimal] = None
    user_corrected: bool
    note: Optional[str] = None


class TransactionUpdate(BaseModel):
    category_id: Optional[int] = None
    scope: Optional[TxScope] = None
    client_id: Optional[int] = None
    section_179_amount: Optional[Decimal] = None
    business_use_pct: Optional[Decimal] = None
    note: Optional[str] = None
    apply_to_merchant: bool = Field(
        default=False,
        description="If true, save a MerchantRule so future transactions from this merchant inherit the change.",
    )


class ClassifyRequest(BaseModel):
    transaction_ids: Optional[list[int]] = None
    only_unclassified: bool = True


class ClassifyResult(BaseModel):
    classified: int
    skipped: int
    used_llm: int
    used_rules: int


class TaxProjection(BaseModel):
    ytd_income: Decimal
    ytd_business_expenses: Decimal
    ytd_section_179: Decimal
    net_se_income: Decimal
    se_tax: Decimal
    federal_income_tax: Decimal
    state_income_tax: Decimal
    total_tax_estimate: Decimal
    safe_harbor_target: Decimal
    quarterly_payment_due: Decimal
    next_due_date: date
    paid_to_date: Decimal
    state: str
    filing_status: str
    notes: list[str]


class HourlyRate(BaseModel):
    client_id: int
    client_name: str
    gross_income: Decimal
    hours: Decimal
    effective_rate: Optional[Decimal] = None
    quoted_rate: Optional[Decimal] = None


class VariancePoint(BaseModel):
    month: str
    net_income: Decimal
    rolling_90d_avg: Decimal


class RunwayScenario(BaseModel):
    name: str
    monthly_burn: Decimal
    months_of_runway: Decimal


class Variance(BaseModel):
    points: list[VariancePoint]
    rolling_90d_stddev: Decimal
    worst_month_net: Decimal
    best_month_net: Decimal
    avg_monthly_net: Decimal
    scenarios: list[RunwayScenario]
    cash_on_hand: Decimal


class EstimatedPaymentCreate(BaseModel):
    paid_on: date
    quarter: str
    federal_amount: Decimal = Decimal(0)
    state_amount: Decimal = Decimal(0)
    note: Optional[str] = None


class EstimatedPaymentOut(EstimatedPaymentCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
