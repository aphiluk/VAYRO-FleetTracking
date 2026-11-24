import { afterAll, expect, test } from "bun:test";
import { Elysia } from "elysia";
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to vehicle_db");
const { prisma } = await import("../src/lib/prisma");
const { vehicleCounts } = await import("../src/modules/dashboard/dashboard.repository");
const { internalRoutes } = await import("../src/modules/internal/internal.routes");
const id = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
afterAll(() => prisma.$disconnect());
test("vehicle summary counts all statuses and types beyond 100 records while keeping foreign type names private", async () => {
  const type = await prisma.vehicleType.create({ data: { company_id: id, type_name: "รถบรรทุกทดสอบ" } });
  const foreignType = await prisma.vehicleType.create({ data: { company_id: id + 1n, type_name: "PRIVATE-FOREIGN-TYPE" } });
  await prisma.vehicle.createMany({ data: Array.from({ length: 105 }, (_, i) => ({ company_id: id, vehicle_code: `SUMMARY-${i}`, license_plate: "ทดสอบ", vehicle_type_id: i === 0 ? null : type.vehicle_type_id, vehicle_status: i % 3 === 0 ? "active" as const : i % 3 === 1 ? "inactive" as const : "maintenance" as const })) });
  await prisma.vehicle.create({ data: { company_id: id, vehicle_code: "LEGACY-FOREIGN-TYPE", license_plate: "ทดสอบ", vehicle_type_id: foreignType.vehicle_type_id } });
  await prisma.vehicle.create({ data: { company_id: id + 1n, vehicle_code: "FOREIGN", license_plate: "ทดสอบ", vehicle_type_id: foreignType.vehicle_type_id } });
  const result = await vehicleCounts(id);
  expect(result.total).toBe(106); expect(result.by_status).toEqual({ active: 36, inactive: 35, maintenance: 35 });
  expect(result.by_type.find((row) => row.vehicle_type_id === String(type.vehicle_type_id))?.count).toBe(104);
  expect(result.by_type.find((row) => row.vehicle_type_id === null)?.count).toBe(1);
  expect(result.by_type.find((row) => row.vehicle_type_id === String(foreignType.vehicle_type_id))?.type_name).toBeNull();
  expect(JSON.stringify(result)).not.toContain("PRIVATE-FOREIGN-TYPE"); expect((await vehicleCounts(id + 1n)).total).toBe(1);
  expect(await vehicleCounts(id + 2n)).toEqual({ company_id: String(id + 2n), total: 0, by_status: { active: 0, inactive: 0, maintenance: 0 }, by_type: [] });
});
test("internal vehicle counts require a token and a company", async () => {
  const app = new Elysia({ normalize: false }).use(internalRoutes).compile();
  const response = await app.handle(new Request(`http://localhost/internal/dashboard/summary?company_id=${id}`)); expect(response.status).toBe(401);
  const headers = { "x-internal-token": process.env.INTERNAL_API_TOKEN! };
  expect((await app.handle(new Request("http://localhost/internal/dashboard/summary", { headers }))).status).toBe(422);
  const valid = await app.handle(new Request(`http://localhost/internal/dashboard/summary?company_id=${id}`, { headers })); expect(valid.status).toBe(200); expect((await valid.json()).data.total).toBe(106);
});
