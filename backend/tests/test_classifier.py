from decimal import Decimal

from app.classifier import heuristic_suggestion, merchant_key
from app.models import Category, TxScope


def test_merchant_key_normalization():
    assert merchant_key("STARBUCKS #2310") == merchant_key("STARBUCKS #88")
    assert merchant_key("AMAZON MKTPLCE PMTS") == "amazon mktplce pmts"


def test_heuristic_recognizes_platform_income():
    cats = {"1099 income": Category(id=1, name="1099 Income")}
    s = heuristic_suggestion("Mercor", Decimal("2400.00"), cats)
    assert s.scope == TxScope.business
    assert s.category_id == 1


def test_heuristic_recognizes_software_expense():
    cats = {"software & subscriptions": Category(id=2, name="Software & Subscriptions")}
    s = heuristic_suggestion("Anthropic API", Decimal("-180.00"), cats)
    assert s.scope == TxScope.business
    assert s.category_id == 2
