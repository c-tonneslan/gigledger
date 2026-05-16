"""
Transaction classification.

Two-tier approach:
  1. MerchantRule lookup. Cheap, deterministic, learned from user corrections.
  2. Anthropic Claude fallback for novel merchants.

The LLM call is only meaningful for genuinely new merchants. Once the user corrects a
classification, the rule overrides the LLM forever after for that merchant key. So the
cost-per-transaction trends to zero as the user works through the inbox.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import Category, MerchantRule, Transaction, TxScope


@dataclass
class Suggestion:
    category_id: Optional[int]
    scope: TxScope
    confidence: Decimal
    source: str  # "rule" or "llm" or "heuristic"
    rationale: Optional[str] = None


def merchant_key(merchant: str) -> str:
    """Normalize a merchant string so 'STARBUCKS #2310' and 'STARBUCKS STORE 7' collapse."""
    cleaned = re.sub(r"[#*]+\s*\d+", "", merchant)
    cleaned = re.sub(r"\s+\d{2,}(?:\s|$)", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().lower()
    return cleaned[:120]


def lookup_rule(db: Session, merchant: str) -> Optional[MerchantRule]:
    key = merchant_key(merchant)
    return db.scalar(select(MerchantRule).where(MerchantRule.merchant_key == key))


def _categories_dict(db: Session) -> dict[str, Category]:
    return {c.name.lower(): c for c in db.scalars(select(Category))}


def heuristic_suggestion(merchant: str, amount: Decimal, categories: dict[str, Category]) -> Suggestion:
    """Fallback when no LLM key is configured. Pattern matches the most common merchant types."""
    m = merchant.lower()
    name: Optional[str] = None
    scope = TxScope.unknown
    rationale = "heuristic match on merchant name"

    if amount > 0:
        if any(t in m for t in ("mercor", "outlier", "scale ai", "upwork", "stripe payout")):
            name, scope = "1099 Income", TxScope.business
        else:
            name, scope = "Other Income", TxScope.personal
    else:
        if any(t in m for t in ("aws", "anthropic", "openai", "vercel", "github", "render", "railway")):
            name, scope = "Software & Subscriptions", TxScope.business
        elif any(t in m for t in ("apple store", "best buy", "b&h", "newegg")):
            name, scope = "Equipment", TxScope.business
        elif any(t in m for t in ("uber", "lyft", "amtrak", "delta", "united", "marriott")):
            name, scope = "Travel", TxScope.business
        elif any(t in m for t in ("starbucks", "chipotle", "doordash", "grubhub", "trader joe", "whole foods")):
            name, scope = "Meals", TxScope.personal
        elif any(t in m for t in ("comcast", "verizon", "t-mobile", "at&t")):
            name, scope = "Internet & Phone", TxScope.business
        elif any(t in m for t in ("rent", "mortgage", "electric", "gas company", "water")):
            name, scope = "Home Office", TxScope.business
        else:
            name, scope = "Uncategorized", TxScope.unknown

    cat = categories.get(name.lower()) if name else None
    return Suggestion(
        category_id=cat.id if cat else None,
        scope=scope,
        confidence=Decimal("0.5"),
        source="heuristic",
        rationale=rationale,
    )


def llm_suggestion(merchant: str, raw_description: str, amount: Decimal, categories: dict[str, Category]) -> Optional[Suggestion]:
    settings = get_settings()
    if not settings.anthropic_api_key:
        return None

    try:
        from anthropic import Anthropic
    except ImportError:
        return None

    client = Anthropic(api_key=settings.anthropic_api_key)

    category_list = "\n".join(
        f"- {c.name}: {c.description or 'no description'}" for c in categories.values()
    )

    prompt = (
        "You classify bank transactions for a US freelancer who files Schedule C. "
        "Return strict JSON with keys category, scope, confidence, rationale. "
        "scope must be one of: business, personal, unknown. "
        "category must be one of the names below exactly, or 'Uncategorized'.\n\n"
        f"Categories:\n{category_list}\n\n"
        f"Transaction:\n"
        f"  merchant: {merchant}\n"
        f"  raw description: {raw_description}\n"
        f"  amount: {amount} (positive = money in, negative = money out)\n\n"
        "Respond with JSON only."
    )

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",  # cheap, fast, fine for this
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        # Some models occasionally wrap in code fences.
        if text.startswith("```"):
            text = text.strip("`")
            text = text.split("\n", 1)[1] if "\n" in text else text
            if text.endswith("```"):
                text = text[:-3]
        data = json.loads(text)
    except Exception:
        return None

    cat_name = (data.get("category") or "Uncategorized").strip().lower()
    scope_raw = (data.get("scope") or "unknown").strip().lower()
    try:
        confidence = Decimal(str(data.get("confidence", 0.6))).quantize(Decimal("0.001"))
    except Exception:
        confidence = Decimal("0.6")

    scope = TxScope(scope_raw) if scope_raw in {s.value for s in TxScope} else TxScope.unknown
    category = categories.get(cat_name)

    return Suggestion(
        category_id=category.id if category else None,
        scope=scope,
        confidence=confidence,
        source="llm",
        rationale=data.get("rationale"),
    )


def classify_transaction(db: Session, tx: Transaction, categories: Optional[dict[str, Category]] = None) -> Suggestion:
    if categories is None:
        categories = _categories_dict(db)

    rule = lookup_rule(db, tx.merchant)
    if rule:
        return Suggestion(
            category_id=rule.category_id,
            scope=rule.scope,
            confidence=Decimal("0.99"),
            source="rule",
            rationale=f"merchant rule, {rule.confirmations} confirmation(s)",
        )

    suggestion = llm_suggestion(tx.merchant, tx.raw_description, Decimal(tx.amount), categories)
    if suggestion is None:
        suggestion = heuristic_suggestion(tx.merchant, Decimal(tx.amount), categories)

    return suggestion


def apply_suggestion(tx: Transaction, sug: Suggestion) -> None:
    tx.llm_suggested_category_id = sug.category_id
    tx.llm_suggested_scope = sug.scope
    tx.llm_confidence = sug.confidence
    # Auto-apply for high-confidence rule hits; everything else stays as a suggestion the user reviews.
    if sug.source == "rule" or (sug.confidence and sug.confidence >= Decimal("0.85")):
        tx.category_id = sug.category_id
        tx.scope = sug.scope


def record_correction(db: Session, tx: Transaction) -> MerchantRule:
    """Called when the user manually re-categorizes. Creates or strengthens a rule."""
    key = merchant_key(tx.merchant)
    rule = db.scalar(select(MerchantRule).where(MerchantRule.merchant_key == key))
    if rule:
        rule.category_id = tx.category_id
        rule.scope = tx.scope
        rule.client_id = tx.client_id
        rule.confirmations += 1
    else:
        rule = MerchantRule(
            merchant_key=key,
            category_id=tx.category_id,
            scope=tx.scope,
            client_id=tx.client_id,
            confirmations=1,
        )
        db.add(rule)
    tx.user_corrected = True
    return rule
