import type { ReactNode } from "react";
import { getDemoFleet, type VehicleStatus } from "../_data/fleet-demo";

export const demoFleet = getDemoFleet(0, 0);

export const statusLabels: Record<VehicleStatus, string> = {
  moving: "กำลังวิ่ง",
  parked: "จอดอยู่",
  offline: "ขาดสัญญาณ",
};

export function AdminPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-[64rem] px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--fleet-muted)]">
          {description}
        </p>
      </header>
      {children}
    </main>
  );
}

export const directorySurface =
  "soft-card border border-[var(--fleet-line)] bg-[var(--fleet-surface)]";

export function FleetDirectory({ byDriver = false }: { byDriver?: boolean }) {
  return (
    <ul className={`${directorySurface} divide-y divide-[var(--fleet-line)]`}>
      {demoFleet.map((vehicle) => (
        <li
          key={vehicle.id}
          className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold wrap-anywhere">
              {byDriver ? vehicle.driver : vehicle.plate}
            </p>
            <p className="mt-1 text-xs text-[color:var(--fleet-muted)]">
              {byDriver ? vehicle.plate : vehicle.kind} · {vehicle.area}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--fleet-quiet)] px-2.5 py-1.5 text-xs text-[color:var(--fleet-muted)]">
            {byDriver ? vehicle.kind : statusLabels[vehicle.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}
