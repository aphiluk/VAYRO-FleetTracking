import type { Db, Prisma } from "../../lib/prisma";

export const listVehicles = (db: Db, where: Prisma.VehicleWhereInput, take: number, skip: number) =>
  db.vehicle.findMany({ where, orderBy: { vehicle_id: "asc" }, take, skip });
export const findVehicle = (db: Db, where: Prisma.VehicleWhereInput) => db.vehicle.findFirst({ where });
export const createVehicle = (db: Db, data: Prisma.VehicleUncheckedCreateInput) => db.vehicle.create({ data });
export const updateVehicle = (db: Db, id: bigint, data: Prisma.VehicleUncheckedUpdateInput) => db.vehicle.update({ where: { vehicle_id: id }, data });
export const lockVehicle = (db: Db, id: bigint) => db.$queryRaw`SELECT vehicle_id FROM vehicles WHERE vehicle_id = ${id} FOR UPDATE`;

export const listTypes = (db: Db, where: Prisma.VehicleTypeWhereInput, take: number, skip: number) =>
  db.vehicleType.findMany({ where, orderBy: { vehicle_type_id: "asc" }, take, skip });
export const findType = (db: Db, where: Prisma.VehicleTypeWhereInput) => db.vehicleType.findFirst({ where });
export const createType = (db: Db, data: Prisma.VehicleTypeUncheckedCreateInput) => db.vehicleType.create({ data });
export const updateType = (db: Db, id: bigint, data: Prisma.VehicleTypeUncheckedUpdateInput) => db.vehicleType.update({ where: { vehicle_type_id: id }, data });
export const lockType = (db: Db, id: bigint) => db.$queryRaw`SELECT vehicle_type_id FROM vehicle_types WHERE vehicle_type_id = ${id} FOR UPDATE`;
