import type { FleetVehicle, VehicleCategory } from "./fleet-demo";

export type FleetAlert = {
  id?: string;
  vehicle: Pick<FleetVehicle, "id" | "plate">;
  kind: "speeding" | "slow" | "offRoute" | "incident" | "offline" | "problem";
  detail: string;
  time: number | null;
};

const demoSpeedRanges: Record<VehicleCategory, { min: number; max: number }> = {
  truck: { min: 32, max: 35 },
  car: { min: 25, max: 65 },
  motorcycle: { min: 20, max: 55 },
};

const exampleEvents = [
  {
    vehicleId: "VY-104",
    kind: "offRoute",
    detail: "เหตุการณ์ตัวอย่าง · รถเบี่ยงจากเส้นทางที่กำหนด",
    minutesAgo: 3,
  },
  {
    vehicleId: "VY-106",
    kind: "incident",
    detail: "เหตุการณ์ตัวอย่าง · คนขับรายงานว่ารถเสียและขอความช่วยเหลือ",
    minutesAgo: 8,
  },
] as const;

export function getDemoAlerts(
  fleet: readonly FleetVehicle[],
  now: number,
  startedAt: number | null,
): FleetAlert[] {
  const alerts: FleetAlert[] = [];

  for (const vehicle of fleet) {
    if (vehicle.status === "offline") {
      alerts.push({
        vehicle,
        kind: "offline",
        detail: "แผนที่แสดงตำแหน่งล่าสุดที่ได้รับ",
        time: startedAt,
      });
      continue;
    }

    const age = now - vehicle.updatedAt;
    if (
      vehicle.status !== "moving" ||
      age < 0 || age > 10_000 ||
      !Number.isFinite(vehicle.speed)
    ) continue;

    const { min, max } = demoSpeedRanges[vehicle.category];
    if (vehicle.speed > max) {
      alerts.push({ vehicle, kind: "speeding", detail: `${vehicle.speed} กม./ชม. · เกณฑ์เดโมสูงสุด ${max} กม./ชม.`, time: startedAt });
    } else if (vehicle.speed < min) {
      alerts.push({ vehicle, kind: "slow", detail: `${vehicle.speed} กม./ชม. · เกณฑ์เดโมขั้นต่ำ ${min} กม./ชม.`, time: startedAt });
    }
  }

  for (const { vehicleId, kind, detail, minutesAgo } of exampleEvents) {
    const vehicle = fleet.find(({ id }) => id === vehicleId);
    if (vehicle) {
      alerts.push({ vehicle, kind, detail, time: startedAt === null ? null : startedAt - minutesAgo * 60_000 });
    }
  }

  return alerts.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
}
