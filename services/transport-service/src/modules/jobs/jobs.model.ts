import { ApiError, idSchema } from "@vayro/service-kit";
import { t } from "elysia";
import type { NavigationRoute, TransportJobRecord } from "../../../../../packages/shared-types";
import type { Prisma } from "../../lib/prisma";

const text = (maxLength: number) => t.String({ minLength: 1, maxLength, pattern: "\\S" });
const nullable = <T extends ReturnType<typeof t.String> | ReturnType<typeof t.Number> | typeof idSchema>(schema: T) => t.Optional(t.Union([schema, t.Null()]));
const nonnegative = t.Number({ minimum: 0, maximum: 1e12 });
export const routeSchema = t.Object({
  provider: t.Literal("valhalla"), profile: t.Literal("auto"),
  geometry: t.Object({ type: t.Literal("LineString"), coordinates: t.Array(t.Tuple([t.Number({ minimum: -180, maximum: 180 }), t.Number({ minimum: -90, maximum: 90 })]), { minItems: 2, maxItems: 25000 }) }, { additionalProperties: false }),
  distance_meters: nonnegative, duration_seconds: nonnegative,
  steps: t.Array(t.Object({ instruction: text(2000), distance_meters: nonnegative, duration_seconds: nonnegative, begin_shape_index: t.Integer({ minimum: 0, maximum: 24999 }), end_shape_index: t.Integer({ minimum: 0, maximum: 24999 }) }, { additionalProperties: false }), { maxItems: 2000 }),
}, { additionalProperties: false });
export const statusSchema = t.Union([t.Literal("pending"), t.Literal("assigned"), t.Literal("accepted"), t.Literal("in_progress"), t.Literal("completed"), t.Literal("cancelled"), t.Literal("problem")]);
export const paramsSchema = t.Object({ id: idSchema });
export const querySchema = t.Object({ company_id: t.Optional(idSchema), q: t.Optional(text(100)), job_status: t.Optional(statusSchema), limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })), offset: t.Optional(t.Numeric({ minimum: 0, maximum: 2147483647, multipleOf: 1 })) }, { additionalProperties: false });
const date = t.String({ minLength: 20, maxLength: 40 });
const fields = {
  job_code: text(50), job_name: nullable(t.String({ maxLength: 150 })), pickup_address: text(255), delivery_address: text(255),
  pickup_latitude: nullable(t.Number({ minimum: -90, maximum: 90 })), pickup_longitude: nullable(t.Number({ minimum: -180, maximum: 180 })),
  delivery_latitude: nullable(t.Number({ minimum: -90, maximum: 90 })), delivery_longitude: nullable(t.Number({ minimum: -180, maximum: 180 })),
  cargo_description: nullable(t.String({ maxLength: 2000 })), route_snapshot: t.Optional(t.Union([routeSchema, t.Null()])),
  scheduled_start_at: nullable(date), scheduled_end_at: nullable(date), vehicle_id: nullable(idSchema), driver_id: nullable(idSchema),
};
export const createSchema = t.Object({ ...fields, company_id: t.Optional(idSchema) }, { additionalProperties: false });
export const updateSchema = t.Partial(t.Object(fields), { minProperties: 1, additionalProperties: false });
export const assignSchema = t.Object({ vehicle_id: t.Union([idSchema, t.Null()]), driver_id: t.Union([idSchema, t.Null()]) }, { additionalProperties: false });
export const problemSchema = t.Object({ problem_note: text(2000) }, { additionalProperties: false });
export const actionSchema = t.Optional(t.Object({}, { additionalProperties: false }));
export function invalid(message: string): never { throw new ApiError(422, "VALIDATION_ERROR", message); }
export function cleanText(value: string) { const trimmed = value.trim(); if (!trimmed || trimmed.includes("\u0000")) invalid("Text must contain a value without null characters"); return trimmed; }
export function optionalText(value: string | null) { if (value?.includes("\u0000")) invalid("Text contains a null character"); return value?.trim() || null; }
export function parseDate(value: string | null) {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) invalid("Dates require an ISO 8601 timestamp with timezone");
  const result = new Date(value);
  const day = value.slice(0, 10);
  if (!Number.isFinite(result.getTime()) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) invalid("Invalid calendar timestamp");
  return result;
}
export function validateRoute(route: NavigationRoute | null) {
  if (route === null) return;
  const length = route.geometry.coordinates.length;
  if (route.steps.some((s) => s.begin_shape_index > s.end_shape_index || s.end_shape_index >= length || s.instruction.includes("\u0000"))) invalid("Route step shape indices are invalid");
}
export type JobRow = Prisma.TransportJobGetPayload<object>;
export function toJob(row: JobRow): TransportJobRecord {
  const decimal = (value: JobRow["pickup_latitude"]) => value === null ? null : Number(value);
  const date = (value: Date | null) => value?.toISOString() ?? null;
  return {
    job_id: String(row.job_id), company_id: String(row.company_id), job_code: row.job_code, job_name: row.job_name,
    pickup_address: row.pickup_address, pickup_latitude: decimal(row.pickup_latitude), pickup_longitude: decimal(row.pickup_longitude),
    delivery_address: row.delivery_address, delivery_latitude: decimal(row.delivery_latitude), delivery_longitude: decimal(row.delivery_longitude),
    vehicle_id: row.vehicle_id === null ? null : String(row.vehicle_id), driver_id: row.driver_id === null ? null : String(row.driver_id),
    scheduled_start_at: date(row.scheduled_start_at), scheduled_end_at: date(row.scheduled_end_at), accepted_at: date(row.accepted_at), actual_start_at: date(row.actual_start_at), actual_end_at: date(row.actual_end_at),
    job_status: row.job_status, problem_note: row.problem_note, cargo_description: row.cargo_description, route_snapshot: row.route_snapshot as unknown as NavigationRoute | null,
    created_by: String(row.created_by), created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString(), vehicle: null, driver: null,
  };
}
