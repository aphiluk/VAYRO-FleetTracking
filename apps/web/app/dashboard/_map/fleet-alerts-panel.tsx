import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { FleetAlert } from "../_data/fleet-alerts";
import { MapPanelCollapse } from "./map-panel-drag";

const alertLabels: Record<FleetAlert["kind"], string> = {
  speeding: "ขับเร็วเกินกำหนด",
  slow: "ขับช้ากว่าเกณฑ์",
  offRoute: "ออกนอกเส้นทาง",
  incident: "รายงานเหตุรถเสีย",
  offline: "ขาดสัญญาณ GPS",
  problem: "Driver แจ้งปัญหางาน",
};

const alertTones: Record<FleetAlert["kind"], string> = {
  speeding: "bg-[var(--fleet-signal)]",
  slow: "bg-amber-500",
  offRoute: "bg-amber-500",
  incident: "bg-[var(--fleet-signal)]",
  offline: "bg-slate-400",
  problem: "bg-[var(--fleet-signal)]",
};

const timeFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
});

const focus = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
const muted = "text-[color:var(--fleet-muted)]";

export default function FleetAlertsPanel({ alerts, onClose, onSelect, moveHandle, active, listLayout, listWidth, expanded, onToggle, demo = true, loading = false, error = null }: {
  alerts: FleetAlert[];
  onClose: () => void;
  onSelect: (vehicleId: string) => void;
  moveHandle: ReactNode;
  active: boolean;
  listLayout: "expanded" | "collapsed" | "hidden";
  listWidth?: number;
  expanded: boolean;
  onToggle: () => void;
  demo?: boolean;
  loading?: boolean;
  error?: string | null;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  const mobileBottom = {
    expanded: "[--alerts-bottom:calc(7.25rem+min(12rem,30dvh))]",
    collapsed: "[--alerts-bottom:11.25rem]",
    hidden: "[--alerts-bottom:6.75rem]",
  }[listLayout];

  return (
    <section id="fleet-alerts" data-map-panel aria-labelledby="fleet-alerts-heading"
      style={{ "--alerts-desktop-right": `${(listWidth ?? 312) + 24}px` } as CSSProperties}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      className={`soft-panel absolute inset-x-3 bottom-[var(--alerts-bottom)] flex max-h-[min(26rem,60dvh,calc(100dvh-var(--alerts-bottom)-0.5rem),max(8rem,calc(100dvh-var(--alerts-bottom)-11.5rem)))] flex-col overflow-hidden border border-[var(--fleet-line)] bg-[var(--fleet-surface)] sm:left-auto sm:right-4 sm:w-[22rem] lg:bottom-auto lg:right-[var(--alerts-desktop-right)] lg:top-48 lg:max-h-[calc(100dvh-18rem)] ${mobileBottom} ${active ? "z-[46]" : "z-[45]"}`}>
      <header className={`flex shrink-0 items-center gap-1 px-3.5 py-2.5 ${expanded ? "max-lg:pl-9" : ""}`}>
        <div className="mr-auto">
          <h2 id="fleet-alerts-heading" ref={heading} tabIndex={-1} className="text-sm font-bold outline-none">แจ้งเตือนรถ</h2>
          <p className={`mt-0.5 text-xs ${muted}`}>{loading && !alerts.length ? "กำลังโหลด…" : `${alerts.length} รายการ`} · {demo ? "ข้อมูลจำลอง" : "ข้อมูลบริษัทจริง"}</p>
        </div>
        {moveHandle}
        <MapPanelCollapse panelName="แจ้งเตือน" controls="fleet-alerts-content" expanded={expanded} onToggle={onToggle} />
        <button type="button" onClick={onClose} aria-label="ปิดแผงแจ้งเตือน" className={`grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl hover:bg-[var(--fleet-quiet)] ${muted} ${focus}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </header>

      <div id="fleet-alerts-content" hidden={!expanded} className="min-h-0 overflow-y-auto overscroll-contain border-t border-[var(--fleet-line)] [scrollbar-color:var(--fleet-line)_transparent]">
        {error && <p role="alert" className="p-3 text-xs text-[var(--fleet-accent)]">โหลดแจ้งเตือนงานไม่สำเร็จ กรุณาโหลดข้อมูลใหม่จากแผงสรุป</p>}
        {alerts.length > 0 ? (
          <ul className="divide-y divide-[var(--fleet-line)]">
            {alerts.map(({ id, vehicle, kind, detail, time }) => (
              <li key={id ?? `${vehicle.id}-${kind}`}>
                <button type="button" onClick={() => onSelect(vehicle.id)} aria-label={`${alertLabels[kind]} ${vehicle.plate} ${vehicle.id} ${demo ? "ดูรถบนแผนที่" : "ดูรายละเอียดรถ"}`}
                  className={`flex w-full cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-[var(--fleet-quiet)] ${focus}`}>
                  <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${alertTones[kind]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-sm font-bold">{alertLabels[kind]}</span>
                      {time !== null && <time dateTime={new Date(time).toISOString()} className={`text-xs tabular-nums ${muted}`}>{timeFormat.format(time)}</time>}
                    </span>
                    <span className="mt-1 block text-xs font-semibold">{vehicle.plate} <span className={`font-normal ${muted}`}>· {vehicle.id}</span></span>
                    <span className={`mt-0.5 block text-xs leading-relaxed wrap-anywhere ${muted}`}>{detail}</span>
                  </span>
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" className={`mt-0.5 shrink-0 ${muted}`} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className={`px-4 py-6 text-center text-sm ${muted}`}>{loading ? "กำลังโหลดแจ้งเตือน…" : error ? "ยังแสดงแจ้งเตือนไม่ได้" : demo ? "ยังไม่มีการแจ้งเตือน" : "ยังไม่มีปัญหางานที่ Driver แจ้ง"}</p>}
        {!demo && <p className={`border-t border-[var(--fleet-line)] p-3 text-[11px] leading-relaxed ${muted}`}>แผงนี้แสดงปัญหางานที่คนขับแจ้ง</p>}
      </div>
    </section>
  );
}
