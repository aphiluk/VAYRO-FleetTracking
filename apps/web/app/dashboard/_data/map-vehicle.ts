import type { FleetGpsPoint } from "../../../../../packages/shared-types";
import type { FleetVehicle, VehicleStatus } from "./fleet-demo";
import type { WorkspaceVehicle } from "./workspace-fleet";

export type MapVehicle = Pick<FleetVehicle, "id" | "plate" | "name" | "kind" | "position" | "route"> & {
  category: FleetVehicle["category"] | null;
  heading: number | null;
  status: VehicleStatus | "current" | "delayed";
};

export function hasUsableFix(point: FleetGpsPoint) {
  return point.anomalies.length === 0 &&
    Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}

export function mapVehicleForFix(vehicle: WorkspaceVehicle, point: FleetGpsPoint, loadFailed: boolean): MapVehicle | null {
  if (!hasUsableFix(point)) return null;
  return {
    id: vehicle.id,
    name: vehicle.typeName,
    kind: vehicle.typeName,
    plate: vehicle.plate,
    category: vehicle.category,
    position: [point.longitude, point.latitude],
    heading: point.direction_degree,
    status: loadFailed ? "delayed" : point.freshness,
    route: [],
  };
}

export function hasVehicleModel(vehicle: MapVehicle): vehicle is MapVehicle & {
  category: NonNullable<MapVehicle["category"]>;
  heading: number;
} {
  return vehicle.category !== null && vehicle.heading !== null && vehicle.status !== "delayed";
}

export function mapVehicleLabel(vehicle: MapVehicle) {
  const name = `เลือก ${vehicle.kind} ${vehicle.plate}`;
  if (vehicle.status === "current") return `${name} · ตำแหน่ง GPS ล่าสุด`;
  if (vehicle.status === "delayed") return `${name} · ตำแหน่ง GPS เก่า`;
  return name;
}
