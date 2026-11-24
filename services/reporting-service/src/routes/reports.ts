import { http, idSchema, ok, type createAuthed } from "@vayro/service-kit";
import { Elysia, t } from "elysia";
import type { Sources } from "../adapters/sources";
import { alertsReport, collectAll, gpsReport, jobsReport, routesReport, vehiclesReport, type ReportDef } from "../application/reports";
import { csvResponse, toCsv } from "../domain/csv";
import { resolveCompany } from "../application/scope";
import { paging, parseRange } from "../domain/rules";

export interface ReportDeps {
  authed: ReturnType<typeof createAuthed>;
  sources: Sources;
  clock: () => Date;
}

const dateTime = t.String({ format: "date-time" });
// Vehicle-based reports send lists of vehicle ids to other services, so their pages are smaller.
const common = (maxLimit: number) => ({
  company_id: t.Optional(idSchema),
  page: t.Optional(t.Numeric({ minimum: 1, maximum: 100000, multipleOf: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: maxLimit, multipleOf: 1 })),
  format: t.Optional(t.Union([t.Literal("json"), t.Literal("csv")])),
});
const period = { from: t.Optional(dateTime), to: t.Optional(dateTime) };
const VEHICLE_STATUS = t.Optional(t.Union([t.Literal("active"), t.Literal("inactive"), t.Literal("maintenance")]));
const JOB_STATUS = t.Optional(t.Union(["pending", "assigned", "accepted", "in_progress", "completed", "cancelled", "problem"].map((s) => t.Literal(s))));
const ALERT_TYPE = t.Optional(t.Union(["gps_offline", "overspeed", "geofence_enter", "geofence_exit", "system_anomaly", "job_assignment"].map((s) => t.Literal(s))));
const ALERT_STATUS = t.Optional(t.Union(["unread", "read", "handling", "resolved"].map((s) => t.Literal(s))));

// JSON: one page plus the summary of the whole selection. CSV (format=csv): every row of the selection, up to the export limit.
async function render<Row>(def: ReportDef<Row>, q: { page?: number; limit?: number; format?: string }, clock: () => Date) {
  if (q.format === "csv") return csvResponse(def.name, toCsv(def.columns, await collectAll(def)), clock());
  const { page, limit, offset } = paging(q.page, q.limit);
  const { total, summary, rows } = await def.fetch(offset, limit);
  return { ...ok({ summary, rows }), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), generated_at: clock().toISOString() } };
}

// PDF page 25. Platform Admin, Company Admin and Dispatcher; the company always comes from the signed-in user
// (a Platform Admin must name one with company_id).
export const reportRoutes = ({ authed, sources, clock }: ReportDeps) =>
  new Elysia({ prefix: "/api/v1/reports" }).use(http).use(authed("platform_admin", "company_admin", "dispatcher"))
    .get("/vehicles", async ({ me, query }) => render(vehiclesReport(sources, await resolveCompany(sources, me, query.company_id), { status: query.status }, clock()), query, clock), {
      query: t.Object({ ...common(100), status: VEHICLE_STATUS }),
    })
    .get("/routes", async ({ me, query }) => render(routesReport(sources, await resolveCompany(sources, me, query.company_id), { ...parseRange(query.from, query.to, 1, clock()), vehicleId: query.vehicle_id }), query, clock), {
      query: t.Object({ ...common(100), ...period, vehicle_id: t.Optional(idSchema) }),
    })
    .get("/jobs", async ({ me, query }) => render(jobsReport(sources, await resolveCompany(sources, me, query.company_id), { ...parseRange(query.from, query.to, 30, clock()), status: query.status }), query, clock), {
      query: t.Object({ ...common(200), ...period, status: JOB_STATUS }),
    })
    .get("/alerts", async ({ me, query }) => render(alertsReport(sources, await resolveCompany(sources, me, query.company_id), { ...parseRange(query.from, query.to, 30, clock()), type: query.type, status: query.status }), query, clock), {
      query: t.Object({ ...common(200), ...period, type: ALERT_TYPE, status: ALERT_STATUS }),
    })
    .get("/gps", async ({ me, query }) => render(gpsReport(sources, await resolveCompany(sources, me, query.company_id), parseRange(query.from, query.to, 1, clock()), clock()), query, clock), {
      query: t.Object({ ...common(100), ...period }),
    });
