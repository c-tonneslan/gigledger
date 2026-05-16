export type Scope = "business" | "personal" | "unknown";
export type TxType = "income" | "expense" | "transfer";

export type Account = {
  id: number;
  name: string;
  institution: string;
  mask: string;
  is_business: boolean;
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

export const api = {
  summary: () => request<Summary>("/transactions/summary"),
  transactions: (params?: {
    scope?: Scope;
    needs_review?: boolean;
    limit?: number;
    client_id?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.scope) q.set("scope", params.scope);
    if (params?.needs_review) q.set("needs_review", "true");
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.client_id) q.set("client_id", String(params.client_id));
    const qs = q.toString();
    return request<Transaction[]>(`/transactions${qs ? `?${qs}` : ""}`);
  },
  categories: () => request<Category[]>("/transactions/categories"),
  updateTransaction: (id: number, patch: Partial<{
    category_id: number;
    scope: Scope;
    client_id: number | null;
    section_179_amount: string;
    business_use_pct: string;
    note: string;
    apply_to_merchant: boolean;
  }>) =>
    request<Transaction>(`/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  classify: (only_unclassified = true) =>
    request<{ classified: number; skipped: number; used_llm: number; used_rules: number }>(
      "/transactions/classify",
      { method: "POST", body: JSON.stringify({ only_unclassified }) },
    ),
  clients: () => request<Client[]>("/clients"),
  hourlyRates: (sinceDays = 365) =>
    request<HourlyRate[]>(`/clients/hourly-rates?since_days=${sinceDays}`),
  accounts: () => request<Account[]>("/accounts"),
  taxProjection: (state?: string, filing_status?: string) => {
    const q = new URLSearchParams();
    if (state) q.set("state", state);
    if (filing_status) q.set("filing_status", filing_status);
    const qs = q.toString();
    return request<TaxProjection>(`/taxes/projection${qs ? `?${qs}` : ""}`);
  },
  variance: (months_back = 12) =>
    request<Variance>(`/analytics/variance?months_back=${months_back}`),
};
