from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class TxType(str, PyEnum):
    income = "income"
    expense = "expense"
    transfer = "transfer"


class TxScope(str, PyEnum):
    business = "business"
    personal = "personal"
    unknown = "unknown"


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    institution: Mapped[str] = mapped_column(String(120))
    mask: Mapped[str] = mapped_column(String(8))
    plaid_account_id: Mapped[Optional[str]] = mapped_column(String(80), unique=True)
    is_business: Mapped[bool] = mapped_column(Boolean, default=False)
    # Whether the user treats this account as their tax-set-aside bucket.
    is_tax_reserve: Mapped[bool] = mapped_column(Boolean, default=False)
    current_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account")


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    platform: Mapped[Optional[str]] = mapped_column(String(60))  # Mercor, Outlier, direct, etc.
    default_hourly_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    engagements: Mapped[list["Engagement"]] = relationship(back_populates="client")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="client")


class Engagement(Base):
    """A logged block of billable time against a client. Used for true effective hourly rate."""

    __tablename__ = "engagements"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    worked_on: Mapped[date] = mapped_column(Date)
    hours: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    description: Mapped[Optional[str]] = mapped_column(Text)

    client: Mapped[Client] = relationship(back_populates="engagements")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    # Schedule C line equivalent, when applicable
    schedule_c_line: Mapped[Optional[str]] = mapped_column(String(40))
    is_section_179_eligible: Mapped[bool] = mapped_column(Boolean, default=False)
    deductible: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[Optional[str]] = mapped_column(Text)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    plaid_tx_id: Mapped[Optional[str]] = mapped_column(String(80), unique=True)

    posted_on: Mapped[date] = mapped_column(Date, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    # Signed so income > 0, expense < 0. Easier for variance math than raw Plaid signs.
    merchant: Mapped[str] = mapped_column(String(160))
    raw_description: Mapped[str] = mapped_column(Text)

    tx_type: Mapped[TxType] = mapped_column(Enum(TxType), default=TxType.expense)
    scope: Mapped[TxScope] = mapped_column(Enum(TxScope), default=TxScope.unknown)

    category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("categories.id"))
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id"))

    # Section 179 candidate flag, separate from category to allow per-item override (used vs new asset, business %).
    section_179_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    business_use_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=100)

    llm_suggested_category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("categories.id"))
    llm_suggested_scope: Mapped[Optional[TxScope]] = mapped_column(Enum(TxScope))
    llm_confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    user_corrected: Mapped[bool] = mapped_column(Boolean, default=False)

    note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    account: Mapped[Account] = relationship(back_populates="transactions")
    category: Mapped[Optional[Category]] = relationship(foreign_keys=[category_id])
    llm_suggested_category: Mapped[Optional[Category]] = relationship(foreign_keys=[llm_suggested_category_id])
    client: Mapped[Optional[Client]] = relationship(back_populates="transactions")


class MerchantRule(Base):
    """Stores learned mappings from user corrections. Next time we see the merchant, apply the rule."""

    __tablename__ = "merchant_rules"
    __table_args__ = (UniqueConstraint("merchant_key", name="uq_merchant_rule"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    merchant_key: Mapped[str] = mapped_column(String(160), index=True)
    category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("categories.id"))
    scope: Mapped[TxScope] = mapped_column(Enum(TxScope))
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id"))
    confirmations: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PlaidItem(Base):
    __tablename__ = "plaid_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[str] = mapped_column(String(80), unique=True)
    access_token: Mapped[str] = mapped_column(String(255))
    institution: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class EstimatedPayment(Base):
    """Records of quarterly estimates the user has actually sent in."""

    __tablename__ = "estimated_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    paid_on: Mapped[date] = mapped_column(Date)
    quarter: Mapped[str] = mapped_column(String(8))  # e.g. 2026Q1
    federal_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    state_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    note: Mapped[Optional[str]] = mapped_column(Text)
