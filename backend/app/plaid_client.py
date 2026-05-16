"""
Plaid integration.

In dev we run against Plaid sandbox. If credentials aren't configured the link/exchange
endpoints return a sentinel that the frontend treats as "demo mode" and falls back to
the synthetic seed data. This keeps the whole app demo-able without touching Plaid at all,
which matters for a public portfolio piece where viewers don't have sandbox keys.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from .config import get_settings

DEMO_TOKEN = "demo-sandbox-token"


class PlaidUnavailable(Exception):
    pass


def _plaid_client():
    settings = get_settings()
    if not settings.plaid_client_id or not settings.plaid_secret:
        raise PlaidUnavailable("Plaid credentials not configured; using demo mode.")

    from plaid.api import plaid_api
    from plaid.configuration import Configuration
    from plaid.api_client import ApiClient

    host_map = {
        "sandbox": "https://sandbox.plaid.com",
        "development": "https://development.plaid.com",
        "production": "https://production.plaid.com",
    }
    host = host_map.get(settings.plaid_env, host_map["sandbox"])
    config = Configuration(
        host=host,
        api_key={"clientId": settings.plaid_client_id, "secret": settings.plaid_secret},
    )
    return plaid_api.PlaidApi(ApiClient(config))


def create_link_token(user_id: str = "demo-user") -> dict:
    try:
        from plaid.model.link_token_create_request import LinkTokenCreateRequest
        from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
        from plaid.model.products import Products
        from plaid.model.country_code import CountryCode

        client = _plaid_client()
        req = LinkTokenCreateRequest(
            products=[Products("transactions")],
            client_name="GigLedger",
            country_codes=[CountryCode("US")],
            language="en",
            user=LinkTokenCreateRequestUser(client_user_id=user_id),
        )
        resp = client.link_token_create(req)
        return {"link_token": resp["link_token"], "demo": False}
    except PlaidUnavailable:
        return {"link_token": DEMO_TOKEN, "demo": True}


def exchange_public_token(public_token: str) -> dict:
    if public_token == DEMO_TOKEN:
        return {"access_token": DEMO_TOKEN, "item_id": "demo-item", "demo": True}

    try:
        from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest

        client = _plaid_client()
        req = ItemPublicTokenExchangeRequest(public_token=public_token)
        resp = client.item_public_token_exchange(req)
        return {"access_token": resp["access_token"], "item_id": resp["item_id"], "demo": False}
    except PlaidUnavailable:
        return {"access_token": DEMO_TOKEN, "item_id": "demo-item", "demo": True}


def fetch_transactions(access_token: str, start: Optional[date] = None, end: Optional[date] = None):
    """Returns Plaid's raw transactions list. Caller is responsible for mapping into our schema."""
    if access_token == DEMO_TOKEN:
        return []

    from plaid.model.transactions_get_request import TransactionsGetRequest
    from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions

    client = _plaid_client()
    start = start or (date.today() - timedelta(days=180))
    end = end or date.today()
    req = TransactionsGetRequest(
        access_token=access_token,
        start_date=start,
        end_date=end,
        options=TransactionsGetRequestOptions(count=500, offset=0),
    )
    resp = client.transactions_get(req)
    return resp["transactions"]


def plaid_tx_to_dict(plaid_tx) -> dict:
    """Map a Plaid transaction object to our internal shape. Plaid signs amounts opposite to ours."""
    amount = -Decimal(str(plaid_tx["amount"]))  # Plaid: positive = outflow. We want positive = inflow.
    return {
        "plaid_tx_id": plaid_tx["transaction_id"],
        "posted_on": plaid_tx["date"],
        "amount": amount,
        "merchant": plaid_tx.get("merchant_name") or plaid_tx.get("name") or "Unknown",
        "raw_description": plaid_tx.get("name") or "",
    }
