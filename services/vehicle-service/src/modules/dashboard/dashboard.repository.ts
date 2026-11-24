import type { VehicleDashboardCounts } from "../../../../../packages/shared-types";
import { prisma } from "../../lib/prisma";

export async function vehicleCounts(companyId: bigint): Promise<VehicleDashboardCounts> {
  return prisma.$transaction(async (tx) => {
    const groups = await tx.vehicle.groupBy({ by: ["vehicle_status", "vehicle_type_id"], where: { company_id: companyId }, _count: { _all: true } });
    const ids = [...new Set(groups.flatMap((group) => group.vehicle_type_id === null ? [] : [group.vehicle_type_id]))];
    const types = ids.length ? await tx.vehicleType.findMany({ where: { company_id: companyId, vehicle_type_id: { in: ids } }, select: { vehicle_type_id: true, type_name: true } }) : [];
    const names = new Map(types.map((type) => [String(type.vehicle_type_id), type.type_name]));
    const byType = new Map<string | null, VehicleDashboardCounts["by_type"][number]>();
    const result: VehicleDashboardCounts = { company_id: String(companyId), total: 0, by_status: { active: 0, inactive: 0, maintenance: 0 }, by_type: [] };
    for (const group of groups) {
      result.total += group._count._all;
      result.by_status[group.vehicle_status] += group._count._all;
      const id = group.vehicle_type_id === null ? null : String(group.vehicle_type_id);
      const entry = byType.get(id) ?? { vehicle_type_id: id, type_name: id === null ? null : names.get(id) ?? null, count: 0 };
      entry.count += group._count._all;
      byType.set(id, entry);
    }
    result.by_type = [...byType.values()].sort((a, b) => (a.type_name ?? "").localeCompare(b.type_name ?? "", "th"));
    return result;
  }, { isolationLevel: "RepeatableRead" });
}
