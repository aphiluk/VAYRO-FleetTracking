import type { JobDashboardCounts } from "../../../../../packages/shared-types";
import { prisma } from "../../lib/prisma";

export async function jobCounts(companyId: bigint): Promise<JobDashboardCounts> {
  const groups = await prisma.transportJob.groupBy({ by: ["job_status"], where: { company_id: companyId }, _count: { _all: true } });
  const result: JobDashboardCounts = { company_id: String(companyId), total: 0,
    by_status: { pending: 0, assigned: 0, accepted: 0, in_progress: 0, completed: 0, cancelled: 0, problem: 0 } };
  for (const group of groups) { result.total += group._count._all; result.by_status[group.job_status] += group._count._all; }
  return result;
}
