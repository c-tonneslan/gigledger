from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import plaid_client
from ..database import get_db
from ..models import PlaidItem

router = APIRouter(prefix="/plaid", tags=["plaid"])


class PublicTokenExchange(BaseModel):
    public_token: str
    institution: str = "Plaid Sandbox"


@router.get("/link-token")
def link_token():
    return plaid_client.create_link_token()


@router.post("/exchange")
def exchange(payload: PublicTokenExchange, db: Session = Depends(get_db)):
    result = plaid_client.exchange_public_token(payload.public_token)
    item = PlaidItem(
        item_id=result["item_id"],
        access_token=result["access_token"],
        institution=payload.institution,
    )
    db.add(item)
    db.commit()
    return {"item_id": result["item_id"], "demo": result.get("demo", False)}
