import { ApiError, http, idSchema, internalGuard, ok, parseId, sum, zeroFilled } from "@vayro/service-kit";
import { Elysia, t } from "elysia";
import { config } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { vehicleCounts } from "../dashboard/dashboard.repository";

const STATUSES = ["active", "inactive", "maintenance"] as const;

// Service-to-service API. Not reachable through the gateway; every call needs the internal token.
export const internalRoutes = new Elysia({ prefix: "/internal" }).use(http).use(internalGuard(config.internalToken))
  .get("/dashboard/summary", async ({ query }) => ok(await vehicleCounts(parseId(query.company_id))), { query: t.Object({ company_id: idSchema }, { additionalProperties: false }) })
  // With company_id, the vehicle must belong to that company or it is "not found" (never reveals other companies' vehicles).
  // Without it, any company's vehicle matches: only for Platform Admin callers.
  .get("/vehicles/:id", async ({ params, query }) => {
    const vehicle = await prisma.vehicle.findFirst({
      where: { vehicle_id: parseId(params.id), ...(query.company_id ? { company_id: parseId(query.company_id) } : {}) },
      select: { vehicle_id: true, company_id: true, vehicle_status: true, current_driver_id: true, vehicle_code: true, license_plate: true, vehicle_type: { select: { type_name: true } } },
    });
    if (!vehicle) throw new ApiError(404, "NOT_FOUND", "Vehicle not found");
    return ok({
      vehicle_id: String(vehicle.vehicle_id),
      company_id: String(vehicle.company_id),
      vehicle_status: vehicle.vehicle_status,
      current_driver_id: vehicle.current_driver_id === null ? null : String(vehicle.current_driver_id),
      vehicle_code: vehicle.vehicle_code,
      license_plate: vehicle.license_plate,
      vehicle_type_name: vehicle.vehicle_type?.type_name ?? null,
    });
  }, { params: t.Object({ id: idSchema }), query: t.Object({ company_id: t.Optional(idSchema) }) })
  // For reporting-service: counts of vehicles by status, for one company or (without company_id) the whole platform.
  .get("/stats/vehicles", async ({ query }) => {
    const where = query.company_id ? { company_id: parseId(query.company_id) } : {};
    const [rows, with_driver] = await Promise.all([
      prisma.vehicle.groupBy({ by: ["vehicle_status"], where, _count: { _all: true } }),
      prisma.vehicle.count({ where: { ...where, current_driver_id: { not: null } } }),
    ]);
    const by_status = zeroFilled(STATUSES, rows.map((r) => [r.vehicle_status, r._count._all] as const));
    return ok({ total: sum(by_status), by_status, with_driver });
  }, { query: t.Object({ company_id: t.Optional(idSchema) }) })
  // For reporting-service: one page of a company's vehicles (oldest id first), optionally one status or one vehicle.
  .get("/vehicles", async ({ query }) => {
    const where = {
      company_id: parseId(query.company_id),
      ...(query.status ? { vehicle_status: query.status } : {}),
      ...(query.vehicle_id ? { vehicle_id: parseId(query.vehicle_id) } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        orderBy: { vehicle_id: "asc" },
        take: query.limit ?? 100,
        skip: query.offset ?? 0,
        select: { vehicle_id: true, vehicle_code: true, license_plate: true, vehicle_status: true, current_driver_id: true, vehicle_type: { select: { type_name: true } } },
      }),
      prisma.vehicle.count({ where }),
    ]);
    return ok({
      total,
      rows: rows.map((v) => ({
        vehicle_id: String(v.vehicle_id),
        vehicle_code: v.vehicle_code,
        license_plate: v.license_plate,
        vehicle_type: v.vehicle_type?.type_name ?? null,
        vehicle_status: v.vehicle_status,
        current_driver_id: v.current_driver_id === null ? null : String(v.current_driver_id),
      })),
    });
  }, {
    query: t.Object({
      company_id: idSchema,
      status: t.Optional(t.Union(STATUSES.map((s) => t.Literal(s)))),
      vehicle_id: t.Optional(idSchema),
      limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500, multipleOf: 1 })),
      offset: t.Optional(t.Numeric({ minimum: 0, maximum: 2147483647, multipleOf: 1 })),
    }),
  });
