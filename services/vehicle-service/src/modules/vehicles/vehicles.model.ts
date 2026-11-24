import { ApiError, idSchema } from "@vayro/service-kit";
import { t } from "elysia";
import type { VehicleRecord, VehicleTypeRecord } from "../../../../../packages/shared-types";
import type { Prisma } from "../../lib/prisma";

const text = (maxLength: number) => t.String({ minLength: 1, maxLength, pattern: "\\S" });
const nullableId = t.Optional(t.Union([idSchema, t.Null()]));
export const vehicleStatusSchema = t.Union([t.Literal("active"), t.Literal("inactive"), t.Literal("maintenance")]);
export const paramsSchema = t.Object({ id: idSchema });
const pagination = {
  company_id: t.Optional(idSchema),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
  offset: t.Optional(t.Numeric({ minimum: 0, maximum: 2147483647, multipleOf: 1 })),
};
export const vehicleQuerySchema = t.Object({ ...pagination, q: t.Optional(text(100)), vehicle_status: t.Optional(vehicleStatusSchema) }, { additionalProperties: false });
export const typeQuerySchema = t.Object({ ...pagination, is_active: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])) }, { additionalProperties: false });
const vehicleFields = {
  vehicle_code: text(50),
  license_plate: text(30),
  vehicle_type_id: nullableId,
  current_driver_id: nullableId,
  vehicle_status: t.Optional(vehicleStatusSchema),
};
const typeFields = {
  type_name: text(80),
  description: t.Optional(t.Union([t.String({ maxLength: 255 }), t.Null()])),
  is_active: t.Optional(t.Boolean()),
};
export const createVehicleSchema = t.Object({ ...vehicleFields, company_id: t.Optional(idSchema) }, { additionalProperties: false });
export const updateVehicleSchema = t.Partial(t.Object(vehicleFields), { minProperties: 1, additionalProperties: false });
export const createTypeSchema = t.Object({ ...typeFields, company_id: t.Optional(idSchema) }, { additionalProperties: false });
export const updateTypeSchema = t.Partial(t.Object(typeFields), { minProperties: 1, additionalProperties: false });
export const assignDriverSchema = t.Object({ current_driver_id: t.Union([idSchema, t.Null()]) }, { additionalProperties: false });
export const statusSchema = t.Object({ vehicle_status: vehicleStatusSchema }, { additionalProperties: false });

export function cleanText(value: string) {
  const result = value.trim();
  if (!result || result.includes("\u0000")) throw new ApiError(422, "VALIDATION_ERROR", "Text must contain a non-whitespace value without null characters");
  return result;
}

export function cleanDescription(value: string | null) {
  if (value?.includes("\u0000")) throw new ApiError(422, "VALIDATION_ERROR", "Description contains a null character");
  return value?.trim() || null;
}

export function toVehicle(row: Prisma.VehicleGetPayload<object>): VehicleRecord {
  return {
    vehicle_id: String(row.vehicle_id),
    company_id: String(row.company_id),
    vehicle_code: row.vehicle_code,
    license_plate: row.license_plate,
    vehicle_type_id: row.vehicle_type_id === null ? null : String(row.vehicle_type_id),
    current_driver_id: row.current_driver_id === null ? null : String(row.current_driver_id),
    vehicle_status: row.vehicle_status,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export function toVehicleType(row: Prisma.VehicleTypeGetPayload<object>): VehicleTypeRecord {
  return {
    vehicle_type_id: String(row.vehicle_type_id),
    company_id: String(row.company_id),
    type_name: row.type_name,
    description: row.description,
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
