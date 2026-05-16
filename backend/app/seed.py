"""
Synthetic data generator.

Builds a realistic 18-month window of activity for a freelancer hitting Mercor, Outlier,
some direct consulting, plus normal business and personal spending. Variance is
intentionally lumpy so the runway / volatility charts have something to show.
"""

from __future__ import annotations

import random
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import delete, select

from .database import Base, SessionLocal, engine
from .models import (
    Account,
    Category,
    Client,
    Engagement,
    EstimatedPayment,
    MerchantRule,
    PlaidItem,
    Transaction,
    TxScope,
    TxType,
)

CATEGORIES = [
    # (name, schedule_c_line, sec_179, deductible, description)
    ("1099 Income", None, False, False, "Gross self-employment income"),
    ("W2 Income", None, False, False, "Wages from an employer"),
    ("Other Income", None, False, False, "Interest, refunds, etc."),
    ("Software & Subscriptions", "Office expense", False, True, "SaaS tools used for work"),
    ("Equipment", "Section 179 / Depreciation", True, True, "Computers, monitors, peripherals over $200"),
    ("Office Supplies", "Office expense", False, True, "Small consumables"),
    ("Internet & Phone", "Utilities", False, True, "Home office utilities pro-rated"),
    ("Home Office", "Home office", False, True, "Rent / utilities allocation"),
    ("Travel", "Travel", False, True, "Flights, hotels, transit for work"),
    ("Meals", "Meals", False, True, "50% deductible meals"),
    ("Professional Services", "Legal/Professional", False, True, "CPA, lawyer, contractors"),
    ("Health Insurance", "SE Health Insurance", False, True, "Self-employed health insurance"),
    ("Retirement (SEP-IRA)", "Above-line", False, True, "SEP / Solo 401(k) contributions"),
    ("Estimated Taxes Paid", None, False, False, "Quarterly 1040-ES / state payments"),
    ("Groceries", None, False, False, "Personal food"),
    ("Rent / Mortgage", None, False, False, "Personal housing (untracked for business)"),
    ("Personal", None, False, False, "Everyday personal expenses"),
    ("Transfer", None, False, False, "Account-to-account movement"),
    ("Uncategorized", None, False, False, "Needs review"),
]

ACCOUNTS = [
    ("Chase Business Checking", "Chase", "4421", True, Decimal("18750.00")),
    ("Ally Personal Checking", "Ally", "9182", False, Decimal("6420.00")),
    ("Apple Card", "Apple", "0007", False, Decimal("0.00")),
    ("SEP-IRA (Fidelity)", "Fidelity", "5510", True, Decimal("31400.00")),
]

CLIENTS = [
    ("Mercor", "Mercor", Decimal("60.00")),
    ("Outlier AI", "Outlier", Decimal("55.00")),
    ("Scale AI", "Scale", Decimal("70.00")),
    ("Acme Consulting", "Direct", Decimal("125.00")),
    ("Bluebird Studio", "Direct", Decimal("95.00")),
]

BUSINESS_EXPENSE_PATTERNS = [
    # (merchant, category_name, low, high, frequency_days)
    ("Anthropic", "Software & Subscriptions", 20, 200, 7),
    ("OpenAI", "Software & Subscriptions", 20, 80, 14),
    ("Vercel", "Software & Subscriptions", 20, 40, 30),
    ("GitHub", "Software & Subscriptions", 4, 21, 30),
    ("Render", "Software & Subscriptions", 7, 25, 30),
    ("Linear", "Software & Subscriptions", 8, 16, 30),
    ("Notion", "Software & Subscriptions", 8, 16, 30),
    ("AWS", "Software & Subscriptions", 15, 110, 30),
    ("Verizon Wireless", "Internet & Phone", 65, 95, 30),
    ("Comcast Business", "Internet & Phone", 95, 110, 30),
    ("Apple Store", "Equipment", 800, 2400, 200),
    ("B&H Photo", "Equipment", 250, 800, 180),
    ("Best Buy", "Equipment", 120, 600, 240),
    ("Delta Air Lines", "Travel", 220, 680, 90),
    ("Marriott", "Travel", 180, 380, 90),
    ("Uber", "Travel", 12, 55, 14),
    ("Chipotle", "Meals", 11, 19, 10),
    ("Starbucks", "Meals", 4, 12, 5),
    ("WeWork", "Home Office", 250, 350, 30),
]

PERSONAL_EXPENSE_PATTERNS = [
    ("Trader Joe's", "Groceries", 35, 120, 5),
    ("Whole Foods", "Groceries", 40, 160, 7),
    ("Amazon", "Personal", 18, 220, 4),
    ("Netflix", "Personal", 16, 24, 30),
    ("Spotify", "Personal", 11, 12, 30),
    ("Equinox", "Personal", 245, 270, 30),
    ("Pennsylvania Rent", "Rent / Mortgage", 1850, 1950, 30),
    ("Pennsylvania Electric", "Personal", 60, 140, 30),
    ("PA Water Authority", "Personal", 35, 60, 60),
]

ESTIMATED_PAYMENTS = [
    (date(2026, 1, 15), "2025Q4", Decimal("3800.00"), Decimal("950.00")),
    (date(2026, 4, 15), "2026Q1", Decimal("4200.00"), Decimal("1100.00")),
]


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _client_payment(rng: random.Random, client: Client) -> Decimal:
    # Lumpy payouts: 60-200 hours of accumulated work paid out, with platform fees baked in.
    hours = Decimal(rng.randint(40, 180))
    rate = client.default_hourly_rate or Decimal("60")
    raw = hours * rate
    if client.platform in ("Mercor", "Outlier", "Scale"):
        raw *= Decimal("0.85")  # rough platform/withholding effect
    return raw.quantize(Decimal("0.01"))


def _generate_recurring(
    rng: random.Random,
    start: date,
    end: date,
    pattern: tuple,
    account: Account,
    scope: TxScope,
    categories_by_name: dict[str, Category],
) -> list[Transaction]:
    merchant, category_name, low, high, freq = pattern
    out = []
    cursor = start + timedelta(days=rng.randint(0, freq))
    while cursor <= end:
        amount = Decimal(rng.uniform(low, high)).quantize(Decimal("0.01"))
        out.append(
            Transaction(
                account_id=account.id,
                posted_on=cursor,
                amount=-amount,  # expense
                merchant=merchant,
                raw_description=f"{merchant.upper()} POS PURCHASE",
                tx_type=TxType.expense,
                scope=scope,
                category_id=categories_by_name[category_name].id,
            )
        )
        cursor += timedelta(days=freq + rng.randint(-2, 2))
    return out


def seed(rng: random.Random | None = None):
    rng = rng or random.Random(42)
    reset_db()

    with SessionLocal() as db:
        # Categories
        cat_objs = []
        for name, line, s179, deductible, desc in CATEGORIES:
            cat_objs.append(
                Category(
                    name=name,
                    schedule_c_line=line,
                    is_section_179_eligible=s179,
                    deductible=deductible,
                    description=desc,
                )
            )
        db.add_all(cat_objs)
        db.flush()
        cats = {c.name: c for c in cat_objs}

        # Accounts
        accounts = []
        for name, inst, mask, biz, bal in ACCOUNTS:
            a = Account(name=name, institution=inst, mask=mask, is_business=biz, current_balance=bal)
            accounts.append(a)
        db.add_all(accounts)
        db.flush()
        business_account = next(a for a in accounts if a.is_business and "Checking" in a.name)
        personal_account = next(a for a in accounts if not a.is_business and "Ally" in a.name)
        credit_card = next(a for a in accounts if a.name == "Apple Card")

        # Clients
        client_objs = [
            Client(name=n, platform=p, default_hourly_rate=r) for n, p, r in CLIENTS
        ]
        db.add_all(client_objs)
        db.flush()

        today = date.today()
        start = (today - timedelta(days=540)).replace(day=1)
        end = today

        # Client payments: roughly monthly cadence per active client, with occasional gaps.
        transactions: list[Transaction] = []
        engagements: list[Engagement] = []

        for client in client_objs:
            cursor = start + timedelta(days=rng.randint(0, 30))
            while cursor <= end:
                if rng.random() < 0.18:
                    # Skipped month — dry spell
                    cursor += timedelta(days=30 + rng.randint(-5, 5))
                    continue
                amount = _client_payment(rng, client)
                transactions.append(
                    Transaction(
                        account_id=business_account.id,
                        posted_on=cursor,
                        amount=amount,
                        merchant=client.name,
                        raw_description=f"ACH CREDIT {client.name.upper()} PAYOUT",
                        tx_type=TxType.income,
                        scope=TxScope.business,
                        category_id=cats["1099 Income"].id,
                        client_id=client.id,
                    )
                )
                # Corresponding logged hours, distributed across the prior month.
                hours_worked = (amount / (client.default_hourly_rate or Decimal("60"))).quantize(Decimal("0.5"))
                engagements.append(
                    Engagement(
                        client_id=client.id,
                        worked_on=cursor - timedelta(days=rng.randint(7, 25)),
                        hours=hours_worked,
                        description=f"{client.name} engagement",
                    )
                )
                cursor += timedelta(days=30 + rng.randint(-7, 9))

        # Business expenses (mix between checking and credit card)
        for pattern in BUSINESS_EXPENSE_PATTERNS:
            acct = credit_card if rng.random() < 0.5 else business_account
            transactions.extend(_generate_recurring(rng, start, end, pattern, acct, TxScope.business, cats))

        # Personal expenses on personal accounts
        for pattern in PERSONAL_EXPENSE_PATTERNS:
            acct = credit_card if rng.random() < 0.4 else personal_account
            transactions.extend(_generate_recurring(rng, start, end, pattern, acct, TxScope.personal, cats))

        # Section 179: an occasional big equipment purchase
        s179_dates = [start + timedelta(days=90), start + timedelta(days=420)]
        for d in s179_dates:
            if d > end:
                continue
            amount = Decimal(rng.choice([1899, 2299, 3299, 4899]))
            transactions.append(
                Transaction(
                    account_id=business_account.id,
                    posted_on=d,
                    amount=-amount,
                    merchant="Apple Store",
                    raw_description="APPLE STORE MACBOOK PRO",
                    tx_type=TxType.expense,
                    scope=TxScope.business,
                    category_id=cats["Equipment"].id,
                    section_179_amount=amount,
                    business_use_pct=Decimal("100"),
                )
            )

        # Health insurance: monthly
        cursor = start.replace(day=5)
        while cursor <= end:
            transactions.append(
                Transaction(
                    account_id=business_account.id,
                    posted_on=cursor,
                    amount=Decimal("-485.00"),
                    merchant="Independence Blue Cross",
                    raw_description="HEALTH INSURANCE PREMIUM",
                    tx_type=TxType.expense,
                    scope=TxScope.business,
                    category_id=cats["Health Insurance"].id,
                )
            )
            # Add a month
            next_month = cursor.replace(day=1) + timedelta(days=32)
            cursor = next_month.replace(day=5)

        # Estimated tax payments recorded as separate ledger rows
        for paid_on, quarter, fed, state in ESTIMATED_PAYMENTS:
            if paid_on > end:
                continue
            transactions.append(
                Transaction(
                    account_id=business_account.id,
                    posted_on=paid_on,
                    amount=-(fed + state),
                    merchant="US Treasury / PA Dept of Revenue",
                    raw_description=f"ESTIMATED TAX {quarter}",
                    tx_type=TxType.expense,
                    scope=TxScope.business,
                    category_id=cats["Estimated Taxes Paid"].id,
                )
            )
            db.add(
                EstimatedPayment(
                    paid_on=paid_on,
                    quarter=quarter,
                    federal_amount=fed,
                    state_amount=state,
                    note="Q4 2025 / Q1 2026 1040-ES",
                )
            )

        # SEP-IRA contribution (annual lump)
        sep_date = date(today.year - 1, 12, 20)
        if sep_date >= start:
            transactions.append(
                Transaction(
                    account_id=business_account.id,
                    posted_on=sep_date,
                    amount=Decimal("-12000.00"),
                    merchant="Fidelity SEP-IRA",
                    raw_description="SEP-IRA CONTRIBUTION",
                    tx_type=TxType.expense,
                    scope=TxScope.business,
                    category_id=cats["Retirement (SEP-IRA)"].id,
                )
            )

        db.add_all(transactions)
        db.add_all(engagements)
        db.commit()

        # Establish a couple of learned merchant rules so the UI shows "rule" tags out of the gate.
        learned = [
            ("anthropic", "Software & Subscriptions", TxScope.business),
            ("github", "Software & Subscriptions", TxScope.business),
            ("trader joe's", "Groceries", TxScope.personal),
            ("mercor", "1099 Income", TxScope.business),
        ]
        for key, cat_name, scope in learned:
            rule = MerchantRule(
                merchant_key=key,
                category_id=cats[cat_name].id,
                scope=scope,
                confirmations=rng.randint(2, 8),
            )
            db.add(rule)
        db.commit()

    print("Seed complete.")


if __name__ == "__main__":
    seed()
