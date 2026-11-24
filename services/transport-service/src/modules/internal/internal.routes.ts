import { http, idSchema, internalGuard, ok, optionalWindow, parseId, sum, zeroFilled } from "@vayro/service-kit";
import { Elysia, t } from "elysia";
import { config } from "../../config/env";
import { Prisma, prisma } from "../../lib/prisma";
import { jobCounts } from "../dashboard/dashboard.repository";
import { windowEnd } from "../jobs/jobs.rules";

const STATUSES = ["pending", "assigned", "accepted", "in_progress", "completed", "cancelled", "problem"] as const;
const dateTime = t.String({ format: "date-time" });
const iso = (d: Date | null) => d?.toISOString() ?? null;
const idOrNull = (v: bigint | null) => (v === null ? null : String(v));

// Service-to-service API. Not reachable through the gateway; every call needs the internal token.
export const internalRoutes = new Elysia({ prefix: "/internal" }).use(http).use(internalGuard(config.internalToken))
  .get("/dashboard/summary", async ({ query }) => ok(await jobCounts(parseId(query.company_id))), { query: t.Object({ company_id: idSchema }, { additionalProperties: false }) })
  // Does this driver have a job in progress on this vehicle? Used to accept driver phone positions.
  .get("/jobs/in-progress", async ({ query }) => {
    const job = await prisma.transportJob.findFirst({
      where: { company_id: parseId(query.company_id), vehicle_id: parseId(query.vehicle_id), driver_id: parseId(query.driver_id), job_status: "in_progress" },
      select: { job_id: true },
    });
    return ok({ exists: job !== null });
  }, { query: t.Object({ company_id: idSchema, vehicle_id: idSchema, driver_id: idSchema }) })
  // For reporting-service: jobs created in the window, counted by status, plus the average time completed jobs took.
  // company_id is optional (Platform Admin overview). A job's window is its created_at.
  .get("/stats/jobs", async ({ query }) => {
    const window = optionalWindow(query.from, query.to);
    const where = { ...(query.company_id ? { company_id: parseId(query.company_id) } : {}), ...(window.gte || window.lte ? { created_at: window } : {}) };
    const rows = await prisma.transportJob.groupBy({ by: ["job_status"], where, _count: { _all: true } });
    const by_status = zeroFilled(STATUSES, rows.map((r) => [r.job_status, r._count._all] as const));
    const [avg] = await prisma.$queryRaw<{ minutes: number | null }[]>(Prisma.sql`
      SELECT avg(EXTRACT(EPOCH FROM (actual_end_at - actual_start_at)) / 60)::float8 AS minutes
      FROM transport_jobs
      WHERE job_status = 'completed' AND actual_start_at IS NOT NULL AND actual_end_at >= actual_start_at
        ${query.company_id ? Prisma.sql`AND company_id = ${parseId(query.company_id)}` : Prisma.empty}
        ${window.gte ? Prisma.sql`AND created_at >= ${window.gte}` : Prisma.empty}
        ${window.lte ? Prisma.sql`AND created_at <= ${window.lte}` : Prisma.empty}`);
    return ok({ total: sum(by_status), by_status, avg_duration_minutes: avg?.minutes === null || avg?.minutes === undefined ? null : Math.round(avg.minutes) });
  }, { query: t.Object({ company_id: t.Optional(idSchema), from: t.Optional(dateTime), to: t.Optional(dateTime) }) })
  // For reporting-service: one page of a company's jobs created in the window, newest first, optionally one status.
  .get("/jobs", async ({ query }) => {
    const window = optionalWindow(query.from, query.to);
    const where = { company_id: parseId(query.company_id), ...(query.status ? { job_status: query.status } : {}), ...(window.gte || window.lte ? { created_at: window } : {}) };
    const [rows, total] = await Promise.all([
      prisma.transportJob.findMany({ where, orderBy: [{ created_at: "desc" }, { job_id: "desc" }], take: query.limit ?? 100, skip: query.offset ?? 0 }),
      prisma.transportJob.count({ where }),
    ]);
    return ok({
      total,
      rows: rows.map((j) => ({
        job_id: String(j.job_id),
        job_code: j.job_code,
        job_name: j.job_name,
        job_status: j.job_status,
        pickup_address: j.pickup_address,
        delivery_address: j.delivery_address,
        vehicle_id: idOrNull(j.vehicle_id),
        driver_id: idOrNull(j.driver_id),
        scheduled_start_at: iso(j.scheduled_start_at),
        scheduled_end_at: iso(j.scheduled_end_at),
        actual_start_at: iso(j.actual_start_at),
        actual_end_at: iso(j.actual_end_at),
        created_at: j.created_at.toISOString(),
        duration_minutes: j.actual_start_at && j.actual_end_at && j.actual_end_at >= j.actual_start_at ? Math.round((j.actual_end_at.getTime() - j.actual_start_at.getTime()) / 60_000) : null,
        has_problem: j.problem_note !== null && j.problem_note !== "",
      })),
    });
  }, {
    query: t.Object({
      company_id: idSchema,
      from: t.Optional(dateTime),
      to: t.Optional(dateTime),
      status: t.Optional(t.Union(STATUSES.map((s) => t.Literal(s)))),
      limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500, multipleOf: 1 })),
      offset: t.Optional(t.Numeric({ minimum: 0, maximum: 2147483647, multipleOf: 1 })),
    }),
  })
  // When did this driver work this vehicle? route-history-service shows a driver only the stretches of their own jobs.
  // ended_at is null while a job is still running. Newest first, at most 50.
  .get("/jobs/driver-windows", async ({ query }) => {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const rows = await prisma.transportJob.findMany({
      where: {
        company_id: parseId(query.company_id),
        driver_id: parseId(query.driver_id),
        vehicle_id: parseId(query.vehicle_id),
        actual_start_at: { not: null, lte: to },
        // still running, or stopped after the window opened (a stopped job without an end counts until its last update)
        OR: [{ actual_end_at: null, job_status: "in_progress" }, { actual_end_at: { gte: from } }, { actual_end_at: null, job_status: { not: "in_progress" }, updated_at: { gte: from } }],
      },
      select: { job_id: true, job_status: true, actual_start_at: true, actual_end_at: true, updated_at: true },
      orderBy: { actual_start_at: "desc" },
      take: 50,
    });
    return ok(rows.map((row) => ({
      job_id: String(row.job_id),
      started_at: row.actual_start_at!.toISOString(),
      ended_at: windowEnd(row)?.toISOString() ?? null,
    })));
  }, {
    query: t.Object({ company_id: idSchema, driver_id: idSchema, vehicle_id: idSchema, from: t.Optional(t.String({ format: "date-time" })), to: t.Optional(t.String({ format: "date-time" })) }),
  });
