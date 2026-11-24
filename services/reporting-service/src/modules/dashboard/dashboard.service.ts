import { companyScope, requireRole, type Caller } from "@vayro/service-kit";
import type { CompanyDashboardSummary } from "../../../../../packages/shared-types";
import type { SummarySources } from "../../adapters/summaries";

export async function companyDashboard(me: Caller, sources: SummarySources): Promise<CompanyDashboardSummary> {
  requireRole(me, "company_admin");
  const companyId = String(companyScope(me).company_id!);
  const [employees, vehicles, jobs] = await Promise.all([sources.employees(companyId), sources.vehicles(companyId), sources.jobs(companyId)]);
  return { company_id: companyId, generated_at: new Date().toISOString(), employees, vehicles, jobs };
}
