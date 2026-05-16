from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..classifier import apply_suggestion, classify_transaction, record_correction
from ..database import get_db
from ..models import Category, Client, Transaction, TxScope, TxType
from ..schemas import (
    CategoryOut,
    ClassifyRequest,
    ClassifyResult,
    TransactionOut,
    TransactionUpdate,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _to_out(tx: Transaction) -> TransactionOut:
    return TransactionOut(
        id=tx.id,
        account_id=tx.account_id,
        posted_on=tx.posted_on,
        amount=tx.amount,
        merchant=tx.merchant,
        raw_description=tx.raw_description,
        tx_type=tx.tx_type,
        scope=tx.scope,
        category_id=tx.category_id,
        category_name=tx.category.name if tx.category else None,
        client_id=tx.client_id,
        client_name=tx.client.name if tx.client else None,
        section_179_amount=tx.section_179_amount,
        business_use_pct=tx.business_use_pct,
        llm_suggested_category_id=tx.llm_suggested_category_id,
        llm_suggested_scope=tx.llm_suggested_scope,
        llm_confidence=tx.llm_confidence,
        user_corrected=tx.user_corrected,
        note=tx.note,
    )


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    db: Session = Depends(get_db),
    scope: Optional[TxScope] = None,
    tx_type: Optional[TxType] = None,
    needs_review: bool = False,
    since: Optional[date] = None,
    until: Optional[date] = None,
    client_id: Optional[int] = None,
    limit: int = Query(default=200, le=2000),
    offset: int = 0,
):
    q = select(Transaction).options(joinedload(Transaction.category), joinedload(Transaction.client))
    if scope:
        q = q.where(Transaction.scope == scope)
    if tx_type:
        q = q.where(Transaction.tx_type == tx_type)
    if needs_review:
        q = q.where((Transaction.scope == TxScope.unknown) | (Transaction.category_id.is_(None)))
    if since:
        q = q.where(Transaction.posted_on >= since)
    if until:
        q = q.where(Transaction.posted_on <= until)
    if client_id:
        q = q.where(Transaction.client_id == client_id)
    q = q.order_by(Transaction.posted_on.desc(), Transaction.id.desc()).limit(limit).offset(offset)
    rows = db.scalars(q).all()
    return [_to_out(tx) for tx in rows]


@router.get("/summary")
def transaction_summary(
    db: Session = Depends(get_db),
    since: Optional[date] = None,
    until: Optional[date] = None,
):
    q = select(Transaction)
    if since:
        q = q.where(Transaction.posted_on >= since)
    if until:
        q = q.where(Transaction.posted_on <= until)
    rows = db.scalars(q).all()

    income = sum((Decimal(t.amount) for t in rows if t.tx_type == TxType.income and t.scope == TxScope.business), Decimal(0))
    biz_expenses = sum(
        (abs(Decimal(t.amount)) for t in rows
         if t.tx_type == TxType.expense and t.scope == TxScope.business and (t.category is None or t.category.name not in ("Estimated Taxes Paid", "Retirement (SEP-IRA)"))),
        Decimal(0),
    )
    section_179 = sum((Decimal(t.section_179_amount) for t in rows), Decimal(0))
    needs_review = sum(1 for t in rows if t.scope == TxScope.unknown or t.category_id is None)

    return {
        "transaction_count": len(rows),
        "income": income.quantize(Decimal("0.01")),
        "business_expenses": biz_expenses.quantize(Decimal("0.01")),
        "section_179_ytd": section_179.quantize(Decimal("0.01")),
        "net_business_income": (income - biz_expenses - section_179).quantize(Decimal("0.01")),
        "needs_review_count": needs_review,
    }


@router.patch("/{tx_id}", response_model=TransactionOut)
def update_transaction(tx_id: int, payload: TransactionUpdate, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transaction not found")

    changed = False
    if payload.category_id is not None and payload.category_id != tx.category_id:
        if not db.get(Category, payload.category_id):
            raise HTTPException(400, "Unknown category_id")
        tx.category_id = payload.category_id
        changed = True
    if payload.scope is not None and payload.scope != tx.scope:
        tx.scope = payload.scope
        changed = True
    if payload.client_id is not None and payload.client_id != tx.client_id:
        if payload.client_id and not db.get(Client, payload.client_id):
            raise HTTPException(400, "Unknown client_id")
        tx.client_id = payload.client_id or None
        changed = True
    if payload.section_179_amount is not None:
        tx.section_179_amount = payload.section_179_amount
    if payload.business_use_pct is not None:
        tx.business_use_pct = payload.business_use_pct
    if payload.note is not None:
        tx.note = payload.note

    if changed:
        tx.user_corrected = True
        if payload.apply_to_merchant:
            record_correction(db, tx)

    db.commit()
    db.refresh(tx)
    return _to_out(tx)


@router.post("/classify", response_model=ClassifyResult)
def classify_transactions(payload: ClassifyRequest, db: Session = Depends(get_db)):
    q = select(Transaction)
    if payload.transaction_ids:
        q = q.where(Transaction.id.in_(payload.transaction_ids))
    elif payload.only_unclassified:
        q = q.where((Transaction.scope == TxScope.unknown) | (Transaction.llm_suggested_scope.is_(None)))

    txs = list(db.scalars(q))
    cats = {c.name.lower(): c for c in db.scalars(select(Category))}

    used_llm = 0
    used_rules = 0
    classified = 0
    skipped = 0

    for tx in txs:
        try:
            sug = classify_transaction(db, tx, cats)
            apply_suggestion(tx, sug)
            classified += 1
            if sug.source == "llm":
                used_llm += 1
            elif sug.source == "rule":
                used_rules += 1
        except Exception:
            skipped += 1

    db.commit()
    return ClassifyResult(classified=classified, skipped=skipped, used_llm=used_llm, used_rules=used_rules)


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return list(db.scalars(select(Category).order_by(Category.name)))
