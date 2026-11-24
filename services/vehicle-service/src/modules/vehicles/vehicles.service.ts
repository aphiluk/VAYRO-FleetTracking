import { ApiError, companyScope, parseId, requireRole, type Caller } from "@vayro/service-kit";
import type { CreateVehicleRequest, CreateVehicleTypeRequest, UpdateVehicleRequest, UpdateVehicleTypeRequest, VehicleStatus } from "../../../../../packages/shared-types";
import type { Directories } from "../../adapters/directories";
import { audit } from "../../lib/audit";
import { prisma, type Db, type Prisma } from "../../lib/prisma";
import { cleanDescription, cleanText, toVehicle, toVehicleType } from "./vehicles.model";
import * as repository from "./vehicles.repository";

interface Query {
  company_id?: string;
  limit?: number;
  offset?: number;
}
export interface VehicleContext {
  me: Caller;
  directories: Directories;
  ip: string | null;
}
const read = (me: Caller) => requireRole(me, "platform_admin", "company_admin", "dispatcher");
const write = (me: Caller) => requireRole(me, "platform_admin", "company_admin");

async function companyForCreation({ me, directories }: VehicleContext, requested?: string) {
  const companyId = companyScope(me, requested).company_id;
  if (!companyId) throw new ApiError(422, "VALIDATION_ERROR", "Platform Admin must select a company");
  if (me.role === "platform_admin" && !(await directories.companyExists(String(companyId)))) {
    throw new ApiError(422, "VALIDATION_ERROR", "Company does not exist");
  }
  return companyId;
}

async function vehicleTarget(db: Db, me: Caller, id: string) {
  const vehicleId = parseId(id);
  await repository.lockVehicle(db, vehicleId);
  const row = await repository.findVehicle(db, { vehicle_id: vehicleId, ...companyScope(me) });
  if (!row) throw new ApiError(404, "NOT_FOUND", "Vehicle not found");
  return row;
}

async function typeTarget(db: Db, me: Caller, id: string) {
  const typeId = parseId(id);
  await repository.lockType(db, typeId);
  const row = await repository.findType(db, { vehicle_type_id: typeId, ...companyScope(me) });
  if (!row) throw new ApiError(404, "NOT_FOUND", "Vehicle type not found");
  return row;
}

// Re-read tenant ownership for existing references too. Only newly assigned references must be active.
async function validateRelations(db: Db, directories: Directories, companyId: bigint, typeId: bigint | null, driverId: bigint | null, previous?: { vehicle_type_id: bigint | null; current_driver_id: bigint | null }) {
  if (typeId !== null) {
    await repository.lockType(db, typeId);
    const type = await repository.findType(db, { vehicle_type_id: typeId, company_id: companyId });
    if (!type) throw new ApiError(404, "NOT_FOUND", "Vehicle type not found in this company");
    if (typeId !== previous?.vehicle_type_id && !type.is_active) throw new ApiError(422, "VALIDATION_ERROR", "Vehicle type is inactive");
  }
  if (driverId !== null) {
    const user = await directories.findUser(String(driverId));
    if (!user || user.company_id !== String(companyId)) throw new ApiError(404, "NOT_FOUND", "Driver not found in this company");
    if (driverId !== previous?.current_driver_id && (user.role !== "driver" || user.account_status !== "active")) {
      throw new ApiError(422, "VALIDATION_ERROR", "Assigned driver must be an active Driver account");
    }
  }
}

export async function listVehicles(me: Caller, query: Query & { q?: string; vehicle_status?: VehicleStatus }) {
  read(me);
  const where: Prisma.VehicleWhereInput = { ...companyScope(me, query.company_id), vehicle_status: query.vehicle_status };
  if (query.q) {
    const value = cleanText(query.q);
    where.OR = [{ vehicle_code: { contains: value, mode: "insensitive" } }, { license_plate: { contains: value, mode: "insensitive" } }];
  }
  return (await repository.listVehicles(prisma, where, query.limit ?? 50, query.offset ?? 0)).map(toVehicle);
}

export async function getVehicle(me: Caller, id: string) {
  read(me);
  const row = await repository.findVehicle(prisma, { vehicle_id: parseId(id), ...companyScope(me) });
  if (!row) throw new ApiError(404, "NOT_FOUND", "Vehicle not found");
  return toVehicle(row);
}

export async function createVehicle(ctx: VehicleContext, body: CreateVehicleRequest) {
  write(ctx.me);
  const companyId = await companyForCreation(ctx, body.company_id);
  const vehicleCode = cleanText(body.vehicle_code);
  const plate = cleanText(body.license_plate);
  const typeId = body.vehicle_type_id == null ? null : parseId(body.vehicle_type_id);
  const driverId = body.current_driver_id == null ? null : parseId(body.current_driver_id);
  const row = await prisma.$transaction(async (tx) => {
    await validateRelations(tx, ctx.directories, companyId, typeId, driverId);
    const created = await repository.createVehicle(tx, { company_id: companyId, vehicle_code: vehicleCode, license_plate: plate, vehicle_type_id: typeId, current_driver_id: driverId, vehicle_status: body.vehicle_status ?? "active" });
    await audit({ companyId, userId: ctx.me.user_id, action: "vehicle.create", entityType: "vehicle", entityId: created.vehicle_id, newValue: toVehicle(created), ip: ctx.ip }, tx);
    return created;
  });
  return toVehicle(row);
}

export async function updateVehicle(ctx: VehicleContext, id: string, body: UpdateVehicleRequest, action = "vehicle.update") {
  write(ctx.me);
  const row = await prisma.$transaction(async (tx) => {
    const previous = await vehicleTarget(tx, ctx.me, id);
    const typeId = body.vehicle_type_id === undefined ? previous.vehicle_type_id : body.vehicle_type_id === null ? null : parseId(body.vehicle_type_id);
    const driverId = body.current_driver_id === undefined ? previous.current_driver_id : body.current_driver_id === null ? null : parseId(body.current_driver_id);
    await validateRelations(tx, ctx.directories, previous.company_id, typeId, driverId, previous);
    const updated = await repository.updateVehicle(tx, previous.vehicle_id, {
      vehicle_code: body.vehicle_code === undefined ? undefined : cleanText(body.vehicle_code),
      license_plate: body.license_plate === undefined ? undefined : cleanText(body.license_plate),
      vehicle_type_id: typeId,
      current_driver_id: driverId,
      vehicle_status: body.vehicle_status,
    });
    await audit({ companyId: previous.company_id, userId: ctx.me.user_id, action, entityType: "vehicle", entityId: previous.vehicle_id, oldValue: toVehicle(previous), newValue: toVehicle(updated), ip: ctx.ip }, tx);
    return updated;
  });
  return toVehicle(row);
}

export async function listTypes(me: Caller, query: Query & { is_active?: string }) {
  read(me);
  const where = { ...companyScope(me, query.company_id), ...(query.is_active === undefined ? {} : { is_active: query.is_active === "true" }) };
  return (await repository.listTypes(prisma, where, query.limit ?? 50, query.offset ?? 0)).map(toVehicleType);
}

export async function createType(ctx: VehicleContext, body: CreateVehicleTypeRequest) {
  write(ctx.me);
  const companyId = await companyForCreation(ctx, body.company_id);
  const name = cleanText(body.type_name);
  const description = body.description === undefined ? null : cleanDescription(body.description);
  const row = await prisma.$transaction(async (tx) => {
    const created = await repository.createType(tx, { company_id: companyId, type_name: name, description, is_active: body.is_active ?? true });
    await audit({ companyId, userId: ctx.me.user_id, action: "vehicle_type.create", entityType: "vehicle_type", entityId: created.vehicle_type_id, newValue: toVehicleType(created), ip: ctx.ip }, tx);
    return created;
  });
  return toVehicleType(row);
}

export async function updateType(ctx: VehicleContext, id: string, body: UpdateVehicleTypeRequest, action = "vehicle_type.update") {
  write(ctx.me);
  const row = await prisma.$transaction(async (tx) => {
    const previous = await typeTarget(tx, ctx.me, id);
    const updated = await repository.updateType(tx, previous.vehicle_type_id, {
      type_name: body.type_name === undefined ? undefined : cleanText(body.type_name),
      description: body.description === undefined ? undefined : cleanDescription(body.description),
      is_active: body.is_active,
    });
    await audit({ companyId: previous.company_id, userId: ctx.me.user_id, action, entityType: "vehicle_type", entityId: previous.vehicle_type_id, oldValue: toVehicleType(previous), newValue: toVehicleType(updated), ip: ctx.ip }, tx);
    return updated;
  });
  return toVehicleType(row);
}
