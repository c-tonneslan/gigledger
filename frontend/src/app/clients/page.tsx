"use client";

import Link from "next/link";
import useSWR from "swr";

import HourlyRateTable from "@/components/HourlyRateTable";
import { api } from "@/lib/api";
import { moneyPrecise } from "@/lib/format";

export default function ClientsPage() {
  const { data: clients } = useSWR("clients", api.clients);
  const { data: rates } = useSWR("rates-long", () => api.hourlyRates(540));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Clients</h1>
        <p className="subtle mt-1 max-w-2xl">
          The honest answer to "is this client worth it." Quoted rate is what they said you'd make.
          Effective is what hit your bank after platform fees and unbilled hours.
        </p>
      </div>

      {rates && <HourlyRateTable rates={rates} linkable />}

      <div className="card">
        <div className="label">Client roster</div>
        <table className="w-full text-sm mt-3">
          <thead>
            <tr className="text-left text-ink-400 text-xs uppercase">
              <th className="font-medium pb-2">Name</th>
              <th className="font-medium pb-2 hidden sm:table-cell">Platform</th>
              <th className="font-medium pb-2 text-right">Default rate</th>
            </tr>
          </thead>
          <tbody>
            {clients?.map((c) => (
              <tr key={c.id} className="border-t border-ink-100">
                <td className="py-2 font-medium">
                  <Link className="link" href={`/clients/${c.id}`}>
                    {c.name}
                  </Link>
                  <span className="sm:hidden ml-2 text-xs text-ink-400 font-normal">
                    {c.platform || "Direct"}
                  </span>
                </td>
                <td className="py-2 text-ink-500 hidden sm:table-cell">{c.platform || "Direct"}</td>
                <td className="py-2 text-right tabular-nums">
                  {c.default_hourly_rate ? moneyPrecise(c.default_hourly_rate) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
