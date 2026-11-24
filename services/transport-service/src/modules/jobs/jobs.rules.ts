// Pure job rules: no database, no HTTP. The service turns a `false` or a message into an API error.

export type JobStatus = "pending" | "assigned" | "in_progress" | "completed" | "cancelled" | "problem";
export type JobAction = "edit" | "assign" | "start" | "complete" | "problem" | "cancel";

// Which statuses each action may start from. completed and cancelled are final.
const ALLOWED: Record<JobAction, readonly JobStatus[]> = {
  edit: ["pending", "assigned", "in_progress", "problem"],
  assign: ["pending", "assigned", "problem"], // after a problem the dispatcher may hand the job to another vehicle or driver
  start: ["assigned", "problem"], // "problem" -> start resumes the job
  complete: ["in_progress"],
  problem: ["in_progress"],
  cancel: ["pending", "assigned", "in_progress", "problem"],
};

export const canDo = (status: JobStatus, action: JobAction) => ALLOWED[action].includes(status);

export const NEXT_STATUS: Record<Exclude<JobAction, "edit">, JobStatus> = {
  assign: "assigned",
  start: "in_progress",
  complete: "completed",
  problem: "problem",
  cancel: "cancelled",
};

// The end must not be before the start. Returns a message, or null when fine (or when one side is missing).
export function scheduleProblem(start: Date | null | undefined, end: Date | null | undefined): string | null {
  if (start && end && end.getTime() < start.getTime()) return "scheduled_end_at must not be before scheduled_start_at";
  return null;
}

// Coordinates only make sense as a pair.
export function coordinateProblem(label: string, latitude: unknown, longitude: unknown): string | null {
  const hasLat = latitude !== null && latitude !== undefined;
  const hasLon = longitude !== null && longitude !== undefined;
  return hasLat === hasLon ? null : `${label}_latitude and ${label}_longitude must be given together`;
}

// Serializes changes to one job, and the start of any job for the same driver or vehicle.
// Always lock in sorted order so two requests that need the same keys can never wait on each other.
export function lockKeys(jobId: bigint, driverId?: bigint | null, vehicleId?: bigint | null): string[] {
  const keys = [`transport:job:${jobId}`];
  if (driverId != null) keys.push(`transport:driver:${driverId}`);
  if (vehicleId != null) keys.push(`transport:vehicle:${vehicleId}`);
  return keys.sort();
}

// When a job's window ended: null means it is still running. A job that stopped without a recorded end
// (problem, or cancelled after a problem) ends at its last update.
export function windowEnd(job: { actual_end_at: Date | null; job_status: JobStatus | "accepted"; updated_at: Date }): Date | null {
  if (job.actual_end_at) return job.actual_end_at;
  return job.job_status === "in_progress" ? null : job.updated_at;
}
