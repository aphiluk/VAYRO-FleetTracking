import type { TransportJobRecord } from "../../../../../packages/shared-types";
import type { FleetVehicle } from "./fleet-demo";
import type { WorkspaceVehicle } from "./workspace-fleet";

export type ChatTarget = {
  vehicleId: string;
  plate: string;
  code: string;
  recipient: { id: string; name: string } | null;
};

const currentJobPriority = new Map([
  ["in_progress", 0],
  ["problem", 1],
  ["accepted", 2],
  ["assigned", 3],
]);

export function vehicleChatTargets(vehicles: WorkspaceVehicle[], jobs: TransportJobRecord[]): ChatTarget[] {
  const currentJobs = new Map<string, { job: TransportJobRecord; priority: number }>();
  for (const job of jobs) {
    const priority = currentJobPriority.get(job.job_status);
    if (!job.vehicle_id || !job.driver_id || priority === undefined) continue;
    const current = currentJobs.get(job.vehicle_id);
    if (!current || priority < current.priority ||
        (priority === current.priority && job.updated_at > current.job.updated_at)) {
      currentJobs.set(job.vehicle_id, { job, priority });
    }
  }

  return vehicles.map(({ id, plate, code, record, driverName }) => {
    const job = currentJobs.get(id)?.job;
    const driverId = job?.driver_id ?? record.current_driver_id;
    const name = job?.driver?.full_name ??
      (driverId === record.current_driver_id ? driverName : `คนขับ #${driverId}`);
    return { vehicleId: id, plate, code, recipient: driverId ? { id: driverId, name } : null };
  });
}

export function demoChatTarget(vehicle: FleetVehicle): ChatTarget {
  return {
    vehicleId: vehicle.id,
    plate: vehicle.plate,
    code: vehicle.id,
    recipient: { id: vehicle.id, name: vehicle.driver },
  };
}

export function chatThreadKey(source: "company" | "demo", target: Pick<ChatTarget, "vehicleId" | "recipient">) {
  return target.recipient ? `${source}:${target.vehicleId}:${target.recipient.id}` : null;
}
