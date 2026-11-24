import { afterAll, expect, test } from "bun:test";
import { Elysia } from "elysia";
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to transport_db");
const { prisma } = await import("../src/lib/prisma");
const { jobCounts } = await import("../src/modules/dashboard/dashboard.repository");
const { internalRoutes } = await import("../src/modules/internal/internal.routes");
const id = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
afterAll(() => prisma.$disconnect());
test("transport summary counts every job including completed/cancelled and separates companies", async () => {
  const statuses = ["pending", "assigned", "accepted", "in_progress", "completed", "cancelled", "problem"] as const;
  await prisma.transportJob.createMany({ data: Array.from({ length: 105 }, (_, i) => ({ company_id: id, job_code: `SUMMARY-${i}`, pickup_address: "Public pickup fixture", delivery_address: "Public delivery fixture", job_status: statuses[i % statuses.length], created_by: 1n })) });
  await prisma.transportJob.create({ data: { company_id: id + 1n, job_code: "FOREIGN", pickup_address: "Public pickup fixture", delivery_address: "Public delivery fixture", created_by: 1n } });
  expect(await jobCounts(id)).toEqual({ company_id: String(id), total: 105, by_status: { pending: 15, assigned: 15, accepted: 15, in_progress: 15, completed: 15, cancelled: 15, problem: 15 } });
  expect((await jobCounts(id + 1n)).total).toBe(1);
  expect((await jobCounts(id + 2n)).by_status).toEqual({ pending: 0, assigned: 0, accepted: 0, in_progress: 0, completed: 0, cancelled: 0, problem: 0 });
});
test("internal job counts require a token and valid company id", async () => {
  const app = new Elysia({ normalize: false }).use(internalRoutes).compile();
  expect((await app.handle(new Request(`http://localhost/internal/dashboard/summary?company_id=${id}`))).status).toBe(401);
  const headers = { "x-internal-token": process.env.INTERNAL_API_TOKEN! };
  expect((await app.handle(new Request("http://localhost/internal/dashboard/summary?company_id=-1", { headers }))).status).toBe(422);
  const valid = await app.handle(new Request(`http://localhost/internal/dashboard/summary?company_id=${id}`, { headers })); expect(valid.status).toBe(200); expect((await valid.json()).data.total).toBe(105);
});
