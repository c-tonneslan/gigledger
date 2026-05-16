from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import analytics
from ..database import get_db
from ..models import Client, Engagement
from ..schemas import ClientCreate, ClientOut, EngagementCreate, EngagementOut, HourlyRate

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=list[ClientOut])
def list_clients(db: Session = Depends(get_db)):
    return list(db.scalars(select(Client).order_by(Client.name)))


@router.post("", response_model=ClientOut)
def create_client(payload: ClientCreate, db: Session = Depends(get_db)):
    existing = db.scalar(select(Client).where(Client.name == payload.name))
    if existing:
        raise HTTPException(409, "Client with that name already exists")
    c = Client(**payload.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.get("/hourly-rates", response_model=list[HourlyRate])
def get_hourly_rates(since_days: Optional[int] = 365, db: Session = Depends(get_db)):
    since = date.today() - timedelta(days=since_days) if since_days else None
    return analytics.hourly_rates(db, since=since)


@router.post("/engagements", response_model=EngagementOut)
def log_engagement(payload: EngagementCreate, db: Session = Depends(get_db)):
    if not db.get(Client, payload.client_id):
        raise HTTPException(400, "Unknown client_id")
    e = Engagement(**payload.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return e
