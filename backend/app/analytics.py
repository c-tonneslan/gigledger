"""Income volatility, runway, and effective hourly rate calculations."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from statistics import pstdev
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Account, Client, Engagement, Transaction, TxScope, TxType
from .schemas import HourlyRate, RunwayScenario, Variance, VariancePoint


def _to_decimal(value) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def hourly_rates(db: Session, since: date | None = None) -> list[HourlyRate]:
    income_q = select(Transaction).where(
        Transaction.tx_type == TxType.income,
        Transaction.client_id.isnot(None),
    )
    if since:
        income_q = income_q.where(Transaction.posted_on >= since)

    income_by_client: dict[int, Decimal] = defaultdict(lambda: Decimal(0))
    for tx in db.scalars(income_q):
        income_by_client[tx.client_id] += _to_decimal(tx.amount)

    hours_q = select(Engagement)
    if since:
        hours_q = hours_q.where(Engagement.worked_on >= since)

    hours_by_client: dict[int, Decimal] = defaultdict(lambda: Decimal(0))
    for eng in db.scalars(hours_q):
        hours_by_client[eng.client_id] += _to_decimal(eng.hours)

    results: list[HourlyRate] = []
    client_ids = set(income_by_client) | set(hours_by_client)
    clients = {c.id: c for c in db.scalars(select(Client).where(Client.id.in_(client_ids)))}

    for cid in client_ids:
        client = clients.get(cid)
        if not client:
            continue
        gross = income_by_client[cid]
        hours = hours_by_client[cid]
        effective = (gross / hours).quantize(Decimal("0.01")) if hours > 0 else None
        results.append(
            HourlyRate(
                client_id=cid,
                client_name=client.name,
                gross_income=gross,
                hours=hours,
                effective_rate=effective,
                quoted_rate=client.default_hourly_rate,
            )
        )
    results.sort(key=lambda r: r.gross_income, reverse=True)
    return results


def _monthly_net(transactions: Iterable[Transaction]) -> dict[str, Decimal]:
    bucket: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
    for tx in transactions:
        # Only business-scoped flows count toward freelancer net.
        if tx.scope != TxScope.business:
            continue
        key = tx.posted_on.strftime("%Y-%m")
        bucket[key] += _to_decimal(tx.amount)
    return bucket


def variance_report(db: Session, months_back: int = 12) -> Variance:
    today = date.today()
    cutoff = (today.replace(day=1) - timedelta(days=months_back * 31)).replace(day=1)

    txs = list(
        db.scalars(
            select(Transaction).where(Transaction.posted_on >= cutoff).order_by(Transaction.posted_on)
        )
    )
    monthly = _monthly_net(txs)

    months_sorted = sorted(monthly.keys())
    points: list[VariancePoint] = []
    # Rolling 90-day avg: use trailing 3 monthly buckets as a proxy.
    for i, m in enumerate(months_sorted):
        window = months_sorted[max(0, i - 2) : i + 1]
        window_vals = [monthly[w] for w in window]
        rolling = sum(window_vals) / Decimal(len(window_vals))
        points.append(
            VariancePoint(
                month=m,
                net_income=monthly[m].quantize(Decimal("0.01")),
                rolling_90d_avg=rolling.quantize(Decimal("0.01")),
            )
        )

    values = [float(monthly[m]) for m in months_sorted] or [0.0]
    stddev = Decimal(str(pstdev(values) if len(values) > 1 else 0.0)).quantize(Decimal("0.01"))
    worst = Decimal(str(min(values))).quantize(Decimal("0.01"))
    best = Decimal(str(max(values))).quantize(Decimal("0.01"))
    avg = (Decimal(str(sum(values))) / Decimal(len(values))).quantize(Decimal("0.01"))

    # Cash on hand: sum balances of all accounts.
    cash = sum((_to_decimal(a.current_balance) for a in db.scalars(select(Account))), Decimal(0))

    # Build runway scenarios.
    expense_only = [
        _to_decimal(tx.amount) for tx in txs
        if tx.scope == TxScope.business and tx.tx_type == TxType.expense
    ]
    monthly_business_burn = (abs(sum(expense_only, Decimal(0))) / Decimal(max(1, len(set(months_sorted)))))
    personal_burn_proxy = monthly_business_burn * Decimal("1.5")  # rough placeholder if user hasn't tagged personal expenses

    scenarios = [
        RunwayScenario(
            name="Business-only burn",
            monthly_burn=monthly_business_burn.quantize(Decimal("0.01")),
            months_of_runway=(cash / monthly_business_burn).quantize(Decimal("0.1")) if monthly_business_burn > 0 else Decimal("99"),
        ),
        RunwayScenario(
            name="Business + estimated personal",
            monthly_burn=personal_burn_proxy.quantize(Decimal("0.01")),
            months_of_runway=(cash / personal_burn_proxy).quantize(Decimal("0.1")) if personal_burn_proxy > 0 else Decimal("99"),
        ),
        RunwayScenario(
            name="Worst-month repeats",
            monthly_burn=abs(worst).quantize(Decimal("0.01")) if worst < 0 else monthly_business_burn.quantize(Decimal("0.01")),
            months_of_runway=(cash / abs(worst)).quantize(Decimal("0.1")) if worst < 0 else Decimal("99"),
        ),
    ]

    return Variance(
        points=points,
        rolling_90d_stddev=stddev,
        worst_month_net=worst,
        best_month_net=best,
        avg_monthly_net=avg,
        scenarios=scenarios,
        cash_on_hand=cash.quantize(Decimal("0.01")),
    )
