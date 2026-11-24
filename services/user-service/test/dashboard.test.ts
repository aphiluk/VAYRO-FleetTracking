import { afterAll, expect, test } from "bun:test";
import { Elysia } from "elysia";
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to user_db");
const { prisma } = await import("../src/lib/prisma");
const { employeeCounts } = await import("../src/modules/dashboard/dashboard.repository");
const { internalRoutes } = await import("../src/modules/internal/internal.routes");
const id = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
afterAll(() => prisma.$disconnect());
test("employee summary counts every database row by company, role and account status, including more than 100 users", async () => {
  const password_hash = await Bun.password.hash(crypto.randomUUID());
  const rows = [
    { role: "company_admin" as const, account_status: "active" as const },
    { role: "dispatcher" as const, account_status: "active" as const },
    { role: "dispatcher" as const, account_status: "inactive" as const },
    ...Array.from({ length: 105 }, (_, i) => ({ role: "driver" as const, account_status: i === 0 ? "suspended" as const : "active" as const })),
  ];
  await prisma.user.createMany({ data: rows.map((row, i) => ({ ...row, company_id: id, full_name: "Summary fixture", email: `summary-${id}-${i}@example.test`, password_hash })) });
  await prisma.user.create({ data: { company_id: id + 1n, full_name: "Other tenant fixture", email: `summary-${id}-foreign@example.test`, password_hash, role: "driver" } });
  expect(await employeeCounts(id)).toEqual({ company_id: String(id), total: 108, by_role: { company_admin: 1, dispatcher: 2, driver: 105 }, by_status: { active: 106, inactive: 1, suspended: 1 } });
  expect((await employeeCounts(id + 1n)).total).toBe(1);
  expect((await employeeCounts(id + 2n)).total).toBe(0);
});
test("internal employee counts require a service token and an explicit valid company id", async () => {
  const app = new Elysia({ normalize: false }).use(internalRoutes).compile();
  const request = (suffix: string, authorized = true) => app.handle(new Request(`http://localhost/internal/dashboard/summary${suffix}`, { headers: authorized ? { "x-internal-token": process.env.INTERNAL_API_TOKEN! } : {} }));
  expect((await request(`?company_id=${id}`, false)).status).toBe(401);
  expect((await request("")).status).toBe(422); expect((await request("?company_id=0")).status).toBe(422);
  const response = await request(`?company_id=${id}`); expect(response.status).toBe(200);
  const json = await response.json(); expect(json.data.total).toBe(108); expect(JSON.stringify(json)).not.toMatch(/password|email|full_name/);
});
