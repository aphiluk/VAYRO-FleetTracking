import type { EmployeeDashboardCounts } from "../../../../../packages/shared-types";
import { prisma } from "../../lib/prisma";

export async function employeeCounts(companyId: bigint): Promise<EmployeeDashboardCounts> {
  const groups = await prisma.user.groupBy({
    by: ["role", "account_status"],
    where: { company_id: companyId, role: { not: "platform_admin" } },
    _count: { _all: true },
  });
  const result: EmployeeDashboardCounts = { company_id: String(companyId), total: 0,
    by_role: { company_admin: 0, dispatcher: 0, driver: 0 }, by_status: { active: 0, inactive: 0, suspended: 0 } };
  for (const group of groups) {
    if (group.role === "platform_admin") continue;
    result.total += group._count._all;
    result.by_role[group.role] += group._count._all;
    result.by_status[group.account_status] += group._count._all;
  }
  return result;
}
