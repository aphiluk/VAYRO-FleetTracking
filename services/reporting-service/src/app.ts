import { createAuthed } from "@vayro/service-kit";
import { Elysia } from "elysia";
import { httpUserResolver, type ResolveUser } from "./adapters/auth-service";
import { httpSources, type Sources } from "./adapters/sources";
import { httpSummarySources, type SummarySources } from "./adapters/summaries";
import { companySummaryRoutes } from "./modules/dashboard/dashboard.routes";
import { dashboardRoutes } from "./routes/dashboard";
import { reportRoutes } from "./routes/reports";

// Every outside dependency can be replaced (tests pass fakes); by default they call the real services over HTTP.
export interface ReportingOptions {
  sources?: Sources;
  summarySources?: SummarySources;
  resolveUser?: ResolveUser;
  clock?: () => Date;
}

export function createReportingApp(options: ReportingOptions = {}) {
  const resolveUser = options.resolveUser ?? httpUserResolver();
  let summarySources = options.summarySources;
  const deps = {
    sources: options.sources ?? httpSources(),
    authed: createAuthed(resolveUser),
    clock: options.clock ?? (() => new Date()),
  };
  return new Elysia()
    .get("/", () => ({ service: "reporting-service", status: "ok" })) // public: Docker health check
    .use(dashboardRoutes(deps))
    .use(companySummaryRoutes({
      resolveUser,
      sources: () => summarySources ??= httpSummarySources(),
    }))
    .use(reportRoutes(deps));
}
