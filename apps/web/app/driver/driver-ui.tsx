import type { TransportJobRecord, TransportJobStatus } from "../../../../packages/shared-types";
import { formatJobTime, transportStates } from "@/lib/transport-format";

const iconPaths = {
  brand: "M3 5h4l5 10 5-10h4l-7.5 14h-3L3 5Z",
  home: "m3 11 9-8 9 8M5 10v10h14V10m-10 10v-6h6v6",
  bell: "M18 8a6 6 0 0 0-12 0c0 6-2 8-3 9h18c-1-1-3-3-3-9m-8 12a2 2 0 0 0 4 0",
  chat: "M20 11.5a7.5 7.5 0 0 1-7.5 7.5h-2L5 21v-4.5A7.5 7.5 0 0 1 10.5 4h2a7.5 7.5 0 0 1 7.5 7.5ZM9 11.5h6",
  send: "m21 3-7 18-4-7-7-4 18-7Zm0 0L10 14",
  calendar: "M7 3v4m10-4v4M4 10h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  logout: "M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m5-13 5 5-5 5m-6-5h11",
  chevron: "m10 6 6 6-6 6",
  box: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 18v-9m8-4.5-8 4.5-8-4.5m4-2.25 8 4.5",
  route: "M6 17h9a3 3 0 1 0 0-6H9a3 3 0 1 1 0-6h9M4 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0ZM17 5a2 2 0 1 0 4 0 2 2 0 1 0-4 0Z",
  locate: "M12 2v3m0 14v3M2 12h3m14 0h3m-3 0a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-4 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  straight: "M12 20V4m-5 5 5-5 5 5",
  left: "M17 20v-7a4 4 0 0 0-4-4H5m5-5L5 9l5 5",
  right: "M7 20v-7a4 4 0 0 1 4-4h8m-5-5 5 5-5 5",
  check: "m5 12 4 4L19 6",
  truck: "M3 17V6h12v11m0-8h3l3 4v4h-2m-9 0h5m-12 0h3m4 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm9 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
} as const;

export function Icon({ name, className = "size-5" }: { name: keyof typeof iconPaths; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill={name === "brand" ? "currentColor" : "none"} stroke={name === "brand" ? "none" : "currentColor"} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={iconPaths[name]} />
    </svg>
  );
}

export type DriverJobEntry = { job: TransportJobRecord; status: TransportJobStatus; completedAt?: string };

export const jobStates = transportStates;

export const surface = "soft-card border border-[var(--fleet-line)] bg-[var(--fleet-surface)]";
export const muted = "text-[var(--fleet-muted)]";
export const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
export const primaryButton = `soft-control inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--fleet-radius)] bg-[var(--fleet-signal)] px-5 py-2.5 text-sm font-semibold text-[var(--fleet-on-signal)] transition duration-200 ease-out enabled:hover:bg-[color-mix(in_srgb,var(--fleet-signal)_95%,var(--fleet-on-signal))] motion-safe:enabled:active:translate-y-px motion-reduce:transition-none disabled:cursor-not-allowed disabled:bg-[var(--fleet-quiet)] disabled:text-[var(--fleet-muted)] ${focus}`;

export function DemoTag() {
  return <span className={`inline-flex w-fit rounded-full bg-[var(--fleet-quiet)] px-2 py-0.5 text-[11px] leading-relaxed ${muted}`}>ข้อมูลจำลอง</span>;
}

export function Status({ status }: { status: TransportJobStatus }) {
  const { label, style } = jobStates[status];
  return <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-relaxed font-bold ${style}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{label}</span>;
}

const completionFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export function JobList({ entries, onOpen, empty }: { entries: DriverJobEntry[]; onOpen: (entry: DriverJobEntry) => void; empty: string }) {
  if (entries.length === 0) return <p className={`px-2 py-5 text-sm ${muted}`}>{empty}</p>;

  return (
    <ul className="space-y-2">
      {entries.map((entry) => {
        const { job, status, completedAt } = entry;
        return (
          <li key={job.job_id}>
            <button type="button" onClick={() => onOpen(entry)} className={`group grid min-h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 rounded-[14px] border border-[var(--fleet-line)] bg-[var(--fleet-highlight)] px-2.5 py-3 text-left transition-colors hover:bg-[var(--fleet-quiet)] motion-reduce:transition-none min-[480px]:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:px-3 ${focus}`}>
              <span className="soft-inset col-start-1 row-span-2 row-start-1 grid size-9 self-start place-items-center rounded-xl bg-[var(--fleet-quiet)] text-[var(--fleet-accent)] min-[480px]:row-span-1 sm:size-10">
                <Icon name={status === "completed" ? "check" : status === "assigned" ? "box" : "truck"} className="size-4.5" />
              </span>
              <span className="col-start-2 row-start-1 min-w-0">
                <span className="block text-sm leading-relaxed font-bold">{job.job_name ?? job.job_code}</span>
                <span className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-relaxed ${muted}`}>
                  <span className="font-mono">{job.job_code}</span>
                  {completedAt ? <time dateTime={completedAt}>{completionFormat.format(new Date(completedAt))}</time> : <span>นัดรับ {formatJobTime(job.scheduled_start_at)}</span>}
                </span>
              </span>
              <span className="col-start-2 row-start-2 min-[480px]:col-start-3 min-[480px]:row-start-1"><Status status={status} /></span>
              <Icon name="chevron" className={`col-start-3 row-start-1 size-4 group-hover:text-[var(--fleet-accent)] min-[480px]:col-start-4 ${muted}`} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
