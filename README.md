# GigLedger

**Live demo: <https://gigledger-lovat.vercel.app>** (synthetic data, edits don't persist)

A personal finance dashboard for freelancers and 1099 contract workers. Mint, YNAB, and Copilot all assume a W2 paycheck and crumble the moment you start chasing 1040-ES deadlines, Section 179 deductions, and platform-fee math for Mercor / Outlier / Upwork. This is the tool I wanted when I filed my own 2025 return.

## Why it exists

I filed my own 2025 taxes as a 1099-NEC contractor. Schedule C, Schedule SE, Section 179 on a laptop, the works. Then I had to figure out Q1 2026 estimated payments without a CFO sitting next to me. The pain points were not novel, every freelancer hits them:

- Self-employment tax sneaks up on people who only set aside "income tax."
- Quarterly estimates need an honest projection of YTD income, not a guess.
- Platform fees and unbilled hours mean the rate on the contract isn't the rate that hits your bank.
- One slow month is normal. Three in a row is an emergency, and the tools don't tell you which you're in.

GigLedger handles those four things. Everything else is a distraction.

## What's in the box

- **Dashboard** — YTD income, net after expenses, next quarterly payment, and a runway projection that's honest about what happens if the worst month repeats.
- **Transactions** — Plaid-backed inbox (sandbox in dev, demo seed otherwise) with LLM-suggested categories. Every correction trains a merchant rule, so the LLM call drops to zero as you work through history.
- **Clients** — effective hourly rate per client over the last year. Quoted rate vs. take-home delta, so you can see exactly which platforms are eating your margin.
- **Taxes** — full Schedule C math projected forward: SE tax, federal income, state (PA defaults to 3.07% flat), QBI deduction, half-SE deduction. State dropdown for the rest. Notes call out the simplifications so it's clear what it does and doesn't model.

## Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind, Recharts, SWR.
- **Backend:** FastAPI, SQLAlchemy 2.0, Pydantic v2.
- **DB:** Postgres in prod, SQLite fallback in dev (no Postgres install needed to demo).
- **Bank data:** Plaid (sandbox). Falls back to seeded synthetic data when keys aren't configured, so the repo is demo-able without a Plaid account.
- **LLM:** Anthropic Claude (Haiku for cost). Only used to categorize novel merchants; rules take over after the first user correction.

## Running it locally

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # optional - works without if you skip Plaid/Anthropic
python -m app.seed    # generates ~1,000 synthetic transactions over 18 months
uvicorn app.main:app --reload
```

The seed produces a realistic mix: client payouts from Mercor / Outlier / Scale plus direct consulting, recurring SaaS bills, a couple of Section-179-eligible laptop purchases, monthly health insurance, and quarterly 1040-ES payments already recorded.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>.

### Wiring up the real stuff (optional)

- Plaid: set `PLAID_CLIENT_ID` and `PLAID_SECRET` in `backend/.env`. The link flow uses the sandbox by default. Without keys the link endpoint returns a `demo` token and the seed data fills the UI.
- Anthropic: set `ANTHROPIC_API_KEY`. The classifier falls back to deterministic heuristics if the key is missing, so the inbox still works.

## Where the value actually is

The LLM does one thing: read a merchant string and pick a category. Once you correct it, that's a `MerchantRule` and the LLM never sees that merchant again. That part isn't impressive on its own.

The real work is in the domain logic:

- [`backend/app/tax.py`](backend/app/tax.py) — SE tax with SS wage base and Additional Medicare, projected federal brackets, simplified QBI, per-state handling, 1040-ES quarterly math.
- [`backend/app/analytics.py`](backend/app/analytics.py) — rolling 90-day variance, runway scenarios, effective hourly rate per client.
- [`backend/app/seed.py`](backend/app/seed.py) — synthetic data that's intentionally lumpy so the charts have something honest to show.

## What this does not do

- It won't file your taxes. Talk to a CPA. The QBI calc here is the simplified version and ignores SSTB phaseouts. The safe-harbor 110%-of-prior-year method isn't modeled.
- It doesn't reconcile invoices to bank deposits yet, so platform fees show up as a haircut on the deposit, not as a separate line.
- State income tax is detailed for flat-rate states and rough for progressive ones. The dropdown surfaces this honestly.

## Deploying

- Frontend: Vercel. `NEXT_PUBLIC_API_URL` points at the backend.
- Backend: Render or Railway. Provide a real `DATABASE_URL`; SQLite is dev-only.
