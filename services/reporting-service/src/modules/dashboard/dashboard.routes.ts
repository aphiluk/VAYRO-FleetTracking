import { ApiError, http, ok, type Caller } from "@vayro/service-kit";
import { Elysia } from "elysia";
import type { SummarySources } from "../../adapters/summaries";
import { companyDashboard } from "./dashboard.service";

interface DashboardRouteOptions { resolveUser: (authorization?: string | null) => Promise<Caller>; sources: () => SummarySources }
export const companySummaryRoutes = (options: DashboardRouteOptions) => new Elysia({ prefix: "/api/v1/dashboard", normalize: false }).use(http)
  .derive(async ({ headers }) => ({ me: await options.resolveUser(headers.authorization) }))
  .get("/company/summary", async ({ request, me, set }) => {
    if (new URL(request.url).search) throw new ApiError(422, "VALIDATION_ERROR", "Query parameters are not supported");
    set.headers["cache-control"] = "no-store";
    return ok(await companyDashboard(me, options.sources()));
  });
