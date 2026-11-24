import type { ReactNode } from "react";
import type { FleetGpsPoint, TransportJobRecord } from "../../../../../packages/shared-types";
import { formatJobTime, transportStates } from "@/lib/transport-format";
import type { WorkspaceVehicle } from "../_data/workspace-fleet";
import { hasUsableFix } from "../_data/map-vehicle";
import { vehicleStatusLabels } from "../_components/fleet-vehicles";
import { VehicleChatButton } from "../_components/fleet-chat";
import { MapPanelCollapse } from "./map-panel-drag";

const muted = "text-[color:var(--fleet-muted)]";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
const gpsTime = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium",
});

function VehicleGps({ point, loading, error }: { point?: FleetGpsPoint; loading: boolean; error: string | null }) {
  const usable = point && hasUsableFix(point);
  const delayed = usable && (point.freshness === "delayed" || Boolean(error));
  let status = "ยังไม่ได้รับพิกัด";
  if (point && !usable) status = "พิกัดผิดปกติ";
  else if (delayed) status = "พิกัดเก่า";
  else if (usable) status = "ได้รับพิกัดล่าสุด";
  else if (loading) status = "กำลังโหลดพิกัด…";
  else if (error) status = "โหลดไม่ได้";

  return (
    <section aria-label="ตำแหน่ง GPS" className="mt-3 space-y-2 border-t border-[var(--fleet-line)] pt-3 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-bold">ตำแหน่ง GPS</h3>
        <span className={muted}>{status}</span>
      </div>
      {error && <p role="status" className="text-[var(--fleet-accent)]">{error}</p>}
      {point && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1.5">
          {usable && <>
            <dt className={muted}>พิกัด</dt>
            <dd className="text-right tabular-nums">{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</dd>
          </>}
          <dt className={muted}>ความเร็วที่รายงาน</dt>
          <dd className="text-right tabular-nums">{usable && point.speed_kmh !== null ? `${point.speed_kmh} กม./ชม.` : "—"}</dd>
          <dt className={muted}>เวลาที่บันทึก</dt>
          <dd className="text-right">{gpsTime.format(new Date(point.recorded_at))}</dd>
          <dt className={muted}>เซิร์ฟเวอร์ได้รับ</dt>
          <dd className="text-right">{gpsTime.format(new Date(point.received_at))}</dd>
        </dl>
      )}
    </section>
  );
}

export default function WorkspaceVehicleDetails({ vehicle, jobs, onClose, moveHandle, active, expanded, onToggle, thumbnail, jobsLoading, jobsError, gpsPoint, gpsLoading, gpsError }: {
  vehicle: WorkspaceVehicle; jobs: TransportJobRecord[]; onClose: () => void; moveHandle: ReactNode; active: boolean; expanded: boolean; onToggle: () => void; thumbnail: ReactNode; jobsLoading: boolean; jobsError: string | null;
  gpsPoint?: FleetGpsPoint; gpsLoading: boolean; gpsError: string | null;
}) {
  const { record } = vehicle;
  const assigned = jobs.filter((job) => job.vehicle_id === vehicle.id);
  const job = assigned.find((row) => ["in_progress", "problem", "accepted"].includes(row.job_status)) ?? assigned.find((row) => row.job_status === "assigned") ?? assigned[0];
  return <section id="vehicle-detail" data-map-panel aria-label="รายละเอียดรถ" tabIndex={-1} className={`pointer-events-auto soft-panel absolute inset-x-3 bottom-43 max-h-[42dvh] overflow-y-auto border border-[var(--fleet-line)] bg-[var(--fleet-surface)] p-3.5 outline-none sm:bottom-28 sm:left-4 sm:right-auto sm:w-[18.5rem] lg:bottom-24 ${active ? "z-[46]" : "z-20"}`}>
    <div className="flex items-center gap-2.5">{thumbnail}<div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold">{vehicle.plate}</h2><p className={`mt-0.5 truncate text-[11px] ${muted}`}>{vehicle.typeName} · {vehicle.code}</p></div>{moveHandle}<MapPanelCollapse panelName="รายละเอียดรถ" controls="vehicle-detail-content" expanded={expanded} onToggle={onToggle} /><button type="button" onClick={onClose} aria-label="ปิดรายละเอียดรถ" className={`grid size-9 shrink-0 place-items-center rounded-md text-lg hover:bg-[var(--fleet-quiet)] ${focus}`}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
    <div id="vehicle-detail-content" hidden={!expanded}>
      <p className={`my-3 rounded-lg bg-[var(--fleet-quiet)] p-2 text-xs ${muted}`}>{vehicleStatusLabels[record.vehicle_status]} · สถานะทะเบียนรถ</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2 text-xs"><dt className={muted}>คนขับประจำรถ</dt><dd className="text-right font-semibold wrap-anywhere">{vehicle.driverName}</dd><dt className={muted}>แก้ไขทะเบียนล่าสุด</dt><dd className={`text-right ${muted}`}>{formatJobTime(record.updated_at)}</dd></dl>
      <VehicleChatButton vehicleId={vehicle.id} />
      <VehicleGps point={gpsPoint} loading={gpsLoading} error={gpsError} />
      <section className="mt-3 space-y-2 border-t border-[var(--fleet-line)] pt-3" aria-label="งานของรถ"><h3 className="text-xs font-bold">งานของรถ</h3>{jobsError && <p role="alert" className="text-xs text-[var(--fleet-accent)]">โหลดงานไม่สำเร็จ กรุณาโหลดข้อมูลใหม่</p>}{job ? <><div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-bold">{job.job_code}</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${transportStates[job.job_status].style}`}>{transportStates[job.job_status].label}</span></div><p className="text-xs leading-relaxed wrap-anywhere">{job.job_name ?? job.job_code}</p><p className={`text-xs leading-relaxed wrap-anywhere ${muted}`}>คนขับงาน: {job.driver?.full_name ?? "ยังไม่กำหนด"}</p><dl className={`space-y-1 text-xs leading-relaxed wrap-anywhere ${muted}`}><div><dt className="inline font-semibold">รับ </dt><dd className="inline">{job.pickup_address}</dd></div><div><dt className="inline font-semibold">ส่ง </dt><dd className="inline">{job.delivery_address}</dd></div></dl>{job.job_status === "problem" && <p className="rounded-lg bg-[var(--fleet-selected)] p-2 text-xs whitespace-pre-wrap wrap-anywhere text-[var(--fleet-accent)]">{job.problem_note}</p>}</> : <p className={`text-xs ${muted}`}>{jobsLoading ? "กำลังโหลดงาน…" : jobsError ? "ยังแสดงงานไม่ได้" : "ยังไม่มีงานที่ผูกกับรถคันนี้"}</p>}</section>
    </div>
  </section>;
}
