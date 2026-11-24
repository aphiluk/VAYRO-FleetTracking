import type { TransportJobRecord, User, VehicleRecord, VehicleTypeRecord } from "../../../../../packages/shared-types";
import type { FleetAlert } from "./fleet-alerts";
import type { VehicleCategory } from "./fleet-demo";

export type WorkspaceVehicle = { record: VehicleRecord; id: string; code: string; plate: string; typeName: string; driverName: string; category: VehicleCategory | null };
export function vehicleCategory(typeName: string): VehicleCategory | null {
  if (/มอเตอร์ไซ|จักรยานยนต์|motorcycle|motorbike/i.test(typeName)) return "motorcycle";
  if (/บรรทุก|truck|lorry/i.test(typeName)) return "truck";
  if (/รถยนต์|รถเก๋ง|กระบะ|\bcar\b|pickup|sedan/i.test(typeName)) return "car";
  return null;
}
export function workspaceFleet(vehicles: VehicleRecord[], types: VehicleTypeRecord[], drivers: User[], jobs: TransportJobRecord[]): WorkspaceVehicle[] {
  const typeNames = new Map(types.map((type) => [type.vehicle_type_id, type.type_name]));
  const driverNames = new Map(drivers.map((driver) => [driver.user_id, driver.full_name]));
  for (const job of jobs) if (job.driver) driverNames.set(job.driver.user_id, job.driver.full_name);
  return vehicles.map((record) => {
    const typeName = record.vehicle_type_id ? typeNames.get(record.vehicle_type_id) ?? "ไม่พบประเภทรถ" : "ยังไม่ระบุประเภท";
    return { record, id: record.vehicle_id, code: record.vehicle_code, plate: record.license_plate, typeName, category: vehicleCategory(typeName), driverName: record.current_driver_id ? driverNames.get(record.current_driver_id) ?? `ผู้ใช้ #${record.current_driver_id}` : "ยังไม่กำหนดคนขับประจำรถ" };
  });
}
export function jobProblemAlerts(jobs: TransportJobRecord[]): FleetAlert[] {
  return jobs.filter((job) => job.job_status === "problem" && job.vehicle_id !== null).map((job) => ({
    id: `job:${job.job_id}`, kind: "problem", vehicle: { id: job.vehicle_id!, plate: job.vehicle?.license_plate ?? `รถ #${job.vehicle_id}` },
    detail: `${job.job_code} · ${job.problem_note ?? "Driver แจ้งปัญหางาน"}`, time: Number.isFinite(Date.parse(job.updated_at)) ? Date.parse(job.updated_at) : null,
  }));
}
