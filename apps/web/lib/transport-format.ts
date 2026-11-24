import type { NavigationPlace, NavigationRoute, TransportJobRecord, TransportJobStatus } from "../../../packages/shared-types";

export type JobNavigation = { origin: NavigationPlace; destination: NavigationPlace; route: NavigationRoute };

export const transportStates = {
  pending: { label: "รอมอบหมาย", style: "bg-[var(--fleet-quiet)] text-[var(--fleet-muted)]" },
  assigned: { label: "มอบหมายแล้ว", style: "bg-[var(--fleet-quiet)] text-[var(--fleet-muted)]" },
  accepted: { label: "รับแล้ว · รอเริ่ม", style: "bg-[var(--fleet-selected)] text-[var(--fleet-accent)]" },
  in_progress: { label: "กำลังทำงาน", style: "bg-[#e3f2e9] text-[#20593f]" },
  completed: { label: "จบงานแล้ว", style: "bg-[var(--fleet-quiet)] text-[var(--fleet-text)]" },
  cancelled: { label: "ยกเลิกแล้ว", style: "bg-[var(--fleet-quiet)] text-[var(--fleet-muted)]" },
  problem: { label: "แจ้งปัญหา", style: "bg-[var(--fleet-selected)] text-[var(--fleet-accent)]" },
} satisfies Record<TransportJobStatus, { label: string; style: string }>;

const dateTimeFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const dateKeyFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Bangkok" });

export const formatJobTime = (value: string | null) => value ? dateTimeFormat.format(new Date(value)) : "ยังไม่กำหนดเวลา";
export const jobDateKey = (value: string) => dateKeyFormat.format(new Date(value));
export const jobTimeInput = (value: string | null) => value ? new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16) : "";

export function jobPlaces(job: TransportJobRecord) {
  const origin = job.pickup_latitude === null || job.pickup_longitude === null ? undefined : { id: `${job.job_id}:pickup`, label: job.pickup_address, latitude: job.pickup_latitude, longitude: job.pickup_longitude };
  const destination = job.delivery_latitude === null || job.delivery_longitude === null ? undefined : { id: `${job.job_id}:delivery`, label: job.delivery_address, latitude: job.delivery_latitude, longitude: job.delivery_longitude };
  return { origin, destination };
}

export function jobNavigation(job: TransportJobRecord): JobNavigation | undefined {
  const { origin, destination } = jobPlaces(job);
  return origin && destination && job.route_snapshot ? { origin, destination, route: job.route_snapshot } : undefined;
}
