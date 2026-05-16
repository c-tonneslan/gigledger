export type Scope = "business" | "personal" | "unknown";
export type TxType = "income" | "expense" | "transfer";

export type Account = {
  id: number;
  name: string;
  institution: string;
  mask: string;
  is_business: boolean;
  is_tax_reserve?: boolean;
  current_balance: string;
};

export type Category = {
  id: number;
  name: string;
  schedule_c_line: string | null;
  is_section_179_eligible: boolean;
  deductible: boolean;
};

export type Client = {
  id: number;
  name: string;
  platform: string | null;
  default_hourly_rate: string | null;
};

export type Transaction = {
  id: number;
  account_id: number;
  posted_on: string;
  amount: string;
  merchant: string;
  raw_description: string;
  tx_type: TxType;
  scope: Scope;
  category_id: number | null;
  category_name: string | null;
  client_id: number | null;
  client_name: string | null;
  section_179_amount: string;
  business_use_pct: string;
  llm_suggested_category_id: number | null;
  llm_suggested_scope: Scope | null;
  llm_confidence: string | null;
  user_corrected: boolean;
  note: string | null;
};

export type Summary = {
  transaction_count: number;
  income: string;
  business_expenses: string;
  section_179_ytd: string;
  net_business_income: string;
  needs_review_count: number;
};

export type TaxProjection = {
  ytd_income: string;
  ytd_business_expenses: string;
  ytd_section_179: string;
  net_se_income: string;
  se_tax: string;
  federal_income_tax: string;
  state_income_tax: string;
  total_tax_estimate: string;
  safe_harbor_target: string;
  quarterly_payment_due: string;
  next_due_date: string;
  paid_to_date: string;
  state: string;
  filing_status: string;
  notes: string[];
};

export type HourlyRate = {
  client_id: number;
  client_name: string;
  gross_income: string;
  hours: string;
  effective_rate: string | null;
  quoted_rate: string | null;
};

export type ScheduleC = {
  year: number;
  gross_receipts: string;
  expense_lines: {
    category_id: number;
    category_name: string;
    schedule_c_line: string | null;
    amount: string;
    count: number;
  }[];
  section_179_amount: string;
  total_expenses: string;
  net_profit: string;
  as_of: string;
};

export type Variance = {
  points: { month: string; net_income: string; rolling_90d_avg: string }[];
  rolling_90d_stddev: string;
  worst_month_net: string;
  best_month_net: string;
  avg_monthly_net: string;
  scenarios: { name: string; monthly_burn: string; months_of_runway: string }[];
  cash_on_hand: string;
};

const BASE = "/api";
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// Demo mode reads pre-baked JSON files from /demo/*. Lets the portfolio site host the app
// without any backend running. Writes are still acknowledged so the UI feels live, but they
// don't survive a page reload.
async function demoFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/demo${path}`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`demo asset missing: ${path}`);
  return res.json() as Promise<T>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

function filterTransactions(txs: Transaction[], params?: {
  scope?: Scope;
  needs_review?: boolean;
  limit?: number;
  client_id?: number;
}) {
  let out = txs;
  if (params?.scope) out = out.filter((t) => t.scope === params.scope);
  if (params?.needs_review) out = out.filter((t) => t.scope === "unknown" || t.category_id == null);
  if (params?.client_id) out = out.filter((t) => t.client_id === params.client_id);
  if (params?.limit) out = out.slice(0, params.limit);
  return out;
}

export const api = {
  summary: () =>
    DEMO_MODE ? demoFetch<Summary>("/summary.json") : request<Summary>("/transactions/summary"),
  transactions: async (params?: {
    scope?: Scope;
    needs_review?: boolean;
    limit?: number;
    client_id?: number;
  }) => {
    if (DEMO_MODE) {
      const all = await demoFetch<Transaction[]>("/transactions.json");
      return filterTransactions(all, params);
    }
    const q = new URLSearchParams();
    if (params?.scope) q.set("scope", params.scope);
    if (params?.needs_review) q.set("needs_review", "true");
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.client_id) q.set("client_id", String(params.client_id));
    const qs = q.toString();
    return request<Transaction[]>(`/transactions${qs ? `?${qs}` : ""}`);
  },
  categories: () =>
    DEMO_MODE ? demoFetch<Category[]>("/categories.json") : request<Category[]>("/transactions/categories"),
  updateTransaction: async (
    id: number,
    patch: Partial<{
      category_id: number;
      scope: Scope;
      client_id: number | null;
      section_179_amount: string;
      business_use_pct: string;
      note: string;
      apply_to_merchant: boolean;
    }>,
  ) => {
    if (DEMO_MODE) {
      // The Transactions page applies the patch to its local copy after this resolves, so the
      // demo just needs to acknowledge. Nothing persists across reloads.
      return { ok: true } as unknown as Transaction;
    }
    return request<Transaction>(`/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
  classify: async (only_unclassified = true) => {
    if (DEMO_MODE) {
      return { classified: 0, skipped: 0, used_llm: 0, used_rules: 0 };
    }
    return request<{ classified: number; skipped: number; used_llm: number; used_rules: number }>(
      "/transactions/classify",
      { method: "POST", body: JSON.stringify({ only_unclassified }) },
    );
  },
  clients: () => (DEMO_MODE ? demoFetch<Client[]>("/clients.json") : request<Client[]>("/clients")),
  hourlyRates: (sinceDays = 365) =>
    DEMO_MODE
      ? demoFetch<HourlyRate[]>(`/rates-${sinceDays === 540 ? 540 : 365}.json`)
      : request<HourlyRate[]>(`/clients/hourly-rates?since_days=${sinceDays}`),
  accounts: () => (DEMO_MODE ? demoFetch<Account[]>("/accounts.json") : request<Account[]>("/accounts")),
  taxProjection: (state?: string, filing_status?: string) => {
    if (DEMO_MODE) {
      const s = (state || "PA").toUpperCase();
      const f = filing_status === "mfj" ? "mfj" : "single";
      return demoFetch<TaxProjection>(`/tax-${s}-${f}.json`);
    }
    const q = new URLSearchParams();
    if (state) q.set("state", state);
    if (filing_status) q.set("filing_status", filing_status);
    const qs = q.toString();
    return request<TaxProjection>(`/taxes/projection${qs ? `?${qs}` : ""}`);
  },
  variance: (months_back = 12) =>
    DEMO_MODE
      ? demoFetch<Variance>("/variance.json")
      : request<Variance>(`/analytics/variance?months_back=${months_back}`),
  scheduleC: () =>
    DEMO_MODE
      ? demoFetch<ScheduleC>("/schedule-c.json")
      : request<ScheduleC>("/taxes/schedule-c"),
};
