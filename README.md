# GigLedger

**Live demo: <https://gigledger-lovat.vercel.app>** (synthetic data, edits don't persist)

A personal finance dashboard for freelancers and 1099 contract workers. Mint, YNAB, and Copilot all assume a W2 paycheck and crumble the moment you start chasing 1040-ES deadlines, Section 179 deductions, and platform-fee math for Mercor / Outlier / Upwork. This is the tool I wanted when I filed my own 2025 return.

## Demo

Walk through it in the [live deployment](https://gigledger-lovat.vercel.app). The path that shows the most domain depth in 30 seconds:

1. **Dashboard** — the **Tax reserve gap** widget tells you the dollar amount to move into savings before the next 1040-ES, the **Quarterly pacing** bar shows whether you're on safe-harbor pace, and the **Income volatility** chart extends three months past today with a forecast line.
2. **Transactions** — `j` / `k` to navigate the inbox, `b` / `p` / `u` to set scope. Every correction trains a `MerchantRule` so the next charge from that merchant skips the LLM entirely.
3. **Taxes** — the **Schedule C preview** card lays out gross receipts, expenses by IRS line number, and Section 179 separately. The **Section 179 calculator** slides equipment price + business use % and computes effective cost after the federal + SE + state tax-stack savings. **What-If** panel shows the marginal take-home rate on the next dollar of contract income.
4. **Clients/[id]** — click any client name for payment history, monthly gross bars, and a rolling effective-rate line vs. quoted rate.

<details>
<summary>Screenshots and recording</summary>

Local recordings go in [`docs/`](docs/) (gitignored from the repo by default since they get heavy):

- `docs/demo.gif` — embed at the top of this README once captured.
- `docs/screenshot-dashboard.png`, `docs/screenshot-taxes.png` — annotated stills.

`docs/README.md` has the ffmpeg command to convert a Cmd+Shift+5 screen recording into a sensible gif.

</details>

## Why it exists

I filed my own 2025 taxes as a 1099-NEC contractor. Schedule C, Schedule SE, Section 179 on a laptop, the works. Then I had to figure out Q1 2026 estimated payments without a CFO sitting next to me. The pain points were not novel, every freelancer hits them:

- Self-employment tax sneaks up on people who only set aside "income tax."
- Quarterly estimates need an honest projection of YTD income, not a guess.
- Platform fees and unbilled hours mean the rate on the contract isn't the rate that hits your bank.
- One slow month is normal. Three in a row is an emergency, and the tools don't tell you which you're in.

GigLedger handles those four things. Everything else is a distraction.

## What's in the box

- **Dashboard** — YTD income, net after expenses, next quarterly payment, a runway projection that's honest about what happens if the worst month repeats, plus:
  - **Tax reserve gap** — what you owe this year minus what you've already paid and what's already in your tax savings account. The single most common 1099 mistake is spending the gross deposit instead of setting aside the tax share. This catches it.
  - **Quarterly pacing** — visual progress bar against the IRS 1040-ES schedule with a dashed "where you should be by today" marker.
  - **Income volatility** — monthly net with rolling 90-day average and a 3-month forecast line that extends past the last data point.
  - **Income by client** — stacked area showing which client carried which month, so dry spells are interpretable (one client went quiet vs. everyone slowed).
  - **Spending breakdown** — YTD deductible expenses by category donut, top six surfaced, rest rolled into Other.
- **Transactions** — Plaid-backed inbox (sandbox in dev, demo seed otherwise) with LLM-suggested categories. Every correction trains a merchant rule, so the LLM call drops to zero as you work through history. Keyboard nav: `j`/`k` move, `b`/`p`/`u` set scope, `Esc` clears.
- **Clients** — effective hourly rate per client over the last year. Quoted rate vs. take-home delta, so you can see exactly which platforms are eating your margin.
- **Taxes** — full Schedule C math projected forward: SE tax, federal income, state (PA defaults to 3.07% flat), QBI deduction, half-SE deduction. State dropdown for the rest. Plus:
  - **Schedule C preview** card that lays out gross receipts and expense lines with real IRS line numbers (18 Office, 22 Supplies, 24a/b Travel/Meals, 30 Home office, line 13 for Section 179). Useful sanity check before sending the year-end pack to a CPA.
  - **Section 179 calculator** — input equipment price + business use %, output effective cost after the federal + SE + state stack. Buy-this-year vs. next-year toggle.
  - **What-if income panel** — slider for extra contract income / extra deductible expenses with live recompute of total tax and effective take-home rate.
  - **Jargon tooltips** on terms like SE tax, QBI, Section 179, 1040-ES, safe harbor.

## Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind, Recharts, SWR.
- **Backend:** FastAPI, SQLAlchemy 2.0, Pydantic v2.
- **DB:** Postgres in prod, SQLite fallback in dev (no Postgres install needed to demo).
- **Bank data:** Plaid (sandbox). Falls back to seeded synthetic data when keys aren't configured, so the repo is demo-able without a Plaid account.
- **LLM:** Anthropic Claude (Haiku for cost). Only used to categorize novel merchants; rules take over after the first user correction.

## Architecture

```
                    +---------------------------+
                    |   Plaid (sandbox)         |
                    |   Anthropic Claude Haiku  |
                    +-----+----------------+----+
                          |                |
                  link/exchange     classify on miss
                          |                |
                          v                v
+--------------------+   +-----------------------------+
|  Next.js (Vercel)  |   |   FastAPI (uvicorn)         |
|  - App Router      |<->|   /transactions  /taxes     |
|  - SWR cache       |   |   /clients       /analytics |
|  - Recharts        |   |   /plaid         /accounts  |
|  - TS tax engine   |   +--------------+--------------+
|    (mirrors py)    |                  |
+--------------------+                  v
        ^                  +--------------------------+
        |                  |  SQLAlchemy 2.0 models   |
   /demo/*.json            |  Postgres (prod)         |
   for static demo         |  SQLite (local dev)      |
                           +--------------------------+
                                       |
                                       v
                           +--------------------------+
                           |   Domain logic           |
                           |   - tax.py (SE, QBI,     |
                           |     federal, state, 179) |
                           |   - analytics.py         |
                           |     (variance, rates,    |
                           |      runway)             |
                           |   - classifier.py        |
                           |     (rules + LLM)        |
                           +--------------------------+
```

Two things worth calling out:

1. **The static demo and the live app share the React tree.** The frontend has a single `NEXT_PUBLIC_DEMO_MODE` flag that swaps every API call for a pre-baked JSON read out of `frontend/public/demo/`. So the portfolio link works without a backend, but `npm run dev` against `uvicorn` exercises the same code paths.

2. **Tax math lives in two places on purpose.** [`backend/app/tax.py`](backend/app/tax.py) is the source of truth and has the pytest coverage. [`frontend/src/lib/tax.ts`](frontend/src/lib/tax.ts) is a 1:1 TypeScript port that powers the Section 179 calculator and the what-if income panel, so those run client-side with no round-trip. The values are verified to match (SE on $100k = $14,129.55 in both languages).

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

## Tests

Two layers:

```bash
# Backend: pins the tax math (SE wage-base cap, additional Medicare, PA flat rate,
# Section 179 reducing net 1:1, quarterly catch-up logic).
cd backend && .venv/bin/python -m pytest tests/ -q

# Frontend: Playwright e2e smoke suite against the live demo. Verifies dashboard
# KPIs render, the Section 179 calculator recomputes when inputs change, the
# transactions inbox filters work, client detail pages load, and dark mode persists.
cd frontend && npx playwright test
```

The Playwright suite points at `https://gigledger-lovat.vercel.app` by default; set
`PLAYWRIGHT_BASE_URL=http://localhost:3000` to run against a local `next dev` instead.

## Deploying

- Frontend: Vercel. `NEXT_PUBLIC_API_URL` points at the backend.
- Backend: Render or Railway. Provide a real `DATABASE_URL`; SQLite is dev-only.
