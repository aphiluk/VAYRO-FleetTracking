import type { Db, Prisma } from "../../lib/prisma";

export const list = (db: Db, where: Prisma.TransportJobWhereInput, take: number, skip: number) => db.transportJob.findMany({ where, orderBy: { job_id: "desc" }, take, skip });
export const find = (db: Db, where: Prisma.TransportJobWhereInput) => db.transportJob.findFirst({ where });
export const create = (db: Db, data: Prisma.TransportJobUncheckedCreateInput) => db.transportJob.create({ data });
export const update = (db: Db, id: bigint, data: Prisma.TransportJobUncheckedUpdateInput) => db.transportJob.update({ where: { job_id: id }, data });
export const lock = (db: Db, id: bigint) => db.$queryRaw`SELECT job_id FROM transport_jobs WHERE job_id = ${id} FOR UPDATE`;
// A deterministic order prevents deadlocks. Distinct prefixes also distinguish driver and vehicle ids.
export async function lockResources(db: Db, company: bigint, driver: bigint, vehicle: bigint) {
  for (const key of [`transport:driver:${company}:${driver}`, `transport:vehicle:${company}:${vehicle}`].sort()) {
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  }
}
export const activeConflict = (db: Db, id: bigint, company: bigint, driver: bigint, vehicle: bigint) => find(db, {
  job_id: { not: id }, company_id: company, job_status: { in: ["accepted", "in_progress", "problem"] }, OR: [{ driver_id: driver }, { vehicle_id: vehicle }],
});
