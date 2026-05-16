from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import accounts, analytics, clients, plaid, taxes, transactions

app = FastAPI(title="GigLedger", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)


@app.get("/healthz")
def healthz():
    return {"ok": True}


app.include_router(transactions.router)
app.include_router(clients.router)
app.include_router(taxes.router)
app.include_router(analytics.router)
app.include_router(plaid.router)
app.include_router(accounts.router)
