from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import analytics
from ..database import get_db
from ..schemas import Variance

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/variance", response_model=Variance)
def variance(months_back: int = 12, db: Session = Depends(get_db)):
    return analytics.variance_report(db, months_back=months_back)
