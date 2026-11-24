"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ApiResponse, CompanyDashboardSummary } from "../../../packages/shared-types";

type SummaryContext = { data: CompanyDashboardSummary | null; loading: boolean; error: string | null; refresh: () => void };
const Context = createContext<SummaryContext | null>(null);
export function CompanySummaryProvider({ children, companyId, canView }: { children: ReactNode; companyId: string | null; canView: boolean }) {
  const [data, setData] = useState<CompanyDashboardSummary | null>(null);
  const [loading, setLoading] = useState(canView);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!canView || !companyId) return;
    const controller = new AbortController(); let fetching = false;
    async function load() {
      if (fetching || controller.signal.aborted) return;
      fetching = true;
      try {
        const response = await fetch("/api/dashboard/company", { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as ApiResponse<CompanyDashboardSummary>;
        if (!response.ok || !payload.success) throw new Error(payload.success ? "DASHBOARD_UNAVAILABLE" : payload.error.code);
        if (payload.data.company_id !== companyId) throw new Error("DASHBOARD_UNAVAILABLE");
        if (!controller.signal.aborted) { setData(payload.data); setError(null); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "DASHBOARD_UNAVAILABLE"); }
      finally { fetching = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    const changed = () => { setLoading(true); setRevision((value) => value + 1); };
    const timer = window.setInterval(visible, 30_000);
    document.addEventListener("visibilitychange", visible); window.addEventListener("online", visible); window.addEventListener("vayro:summary-changed", changed);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", visible); window.removeEventListener("vayro:summary-changed", changed); };
  }, [canView, companyId, revision]);
  return <Context.Provider value={{ data, loading, error, refresh: () => { if (canView) { setLoading(true); setRevision((value) => value + 1); } } }}>{children}</Context.Provider>;
}
export function useCompanySummary() {
  const summary = useContext(Context);
  if (!summary) throw new Error("Company summary requires CompanySummaryProvider");
  return summary;
}
