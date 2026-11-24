"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { logout } from "@/lib/auth-actions";
import { useCompanySummary } from "@/lib/company-summary";
import { useTransportJobs } from "@/lib/transport-client";
import { fleetErrorMessage, useFleetVehicles, vehicleStatusLabels } from "../_components/fleet-vehicles";
import { jobProblemAlerts, workspaceFleet } from "../_data/workspace-fleet";
import { useFleetGps } from "../_data/fleet-gps";
import { mapVehicleForFix } from "../_data/map-vehicle";
import WorkspaceVehicleDetails from "./workspace-vehicle-details";
import { accountRoleLabels, demoRoleLabels, useAdminTheme, useDashboardUser, useDemoRole } from "../_components/admin-shell";
import { getDemoAlerts } from "../_data/fleet-alerts";
import {
  getDemoFleet,
  type FleetVehicle,
  type VehicleCategory,
  type VehicleStatus,
} from "../_data/fleet-demo";
import FleetMap from "./fleet-map";
import FleetAlertsPanel from "./fleet-alerts-panel";
import { VehicleChatButton } from "../_components/fleet-chat";
import { MapPanelCollapse, MapPanelHandle, type Offset, type PanelSize } from "./map-panel-drag";

type MapView = "2d" | "3d";
type FleetFilter = "all" | VehicleStatus | "active" | "inactive" | "maintenance";
type MovablePanel = "summary" | "list" | "details" | "alerts";

const statusMeta: Record<FleetFilter, { label: string; dot: string }> = {
  all: { label: "รถทั้งหมด", dot: "bg-[var(--fleet-signal)]" },
  moving: { label: "กำลังวิ่ง", dot: "bg-emerald-500" },
  parked: { label: "จอดอยู่", dot: "bg-amber-500" },
  offline: { label: "ขาดสัญญาณ", dot: "bg-slate-400" },
  active: { label: "ใช้งาน", dot: "bg-emerald-500" },
  inactive: { label: "หยุดใช้งาน", dot: "bg-slate-400" },
  maintenance: { label: "ซ่อมบำรุง", dot: "bg-amber-400" },
};

const clock = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
const panel =
  "pointer-events-auto min-w-0 soft-panel border border-[var(--fleet-line)] bg-[var(--fleet-surface)]";
const control = `inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl soft-control border border-[var(--fleet-line)] bg-[var(--fleet-surface)] px-3 text-xs font-semibold hover:bg-[var(--fleet-selected)] active:soft-inset ${focus}`;
const muted = "text-[color:var(--fleet-muted)]";
const accent = "text-[color:var(--fleet-accent)]";

const icons = {
  map: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
      <path d="M9 3v15m6-12v15" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  truck: (
    <>
      <path d="M3 17V6h12v11m0-7h3l3 4v3h-2m-9 0h5m-10 0H3" />
      <circle cx="7.5" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2m0 15v2m9.5-9.5h-2m-15 0h-2m16.2-6.7-1.4 1.4M6.7 17.3l-1.4 1.4m13.4 0-1.4-1.4M6.7 6.7 5.3 5.3" />
    </>
  ),
  moon: <path d="M20.5 14A8.6 8.6 0 0 1 10 3.5 8.7 8.7 0 1 0 20.5 14Z" />,
  pause: <path d="M9 5.5v13m6-13v13" />,
  play: <path d="m8.5 5 11 7-11 7V5Z" />,
  fit: <path d="M9 4H4v5m11-5h5v5m0 6v5h-5M4 15v5h5m3-10v4m-2-2h4" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.25" />
      <path d="M5.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1" />
    </>
  ),
  check: <path d="m5 12 4 4 10-10" />,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 6-3 7-3 9h18c0-2-3-3-3-9m-8 12a2 2 0 0 0 4 0" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  layout: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M14 4v16m0-8h6.5" />
    </>
  ),
  signal: <path d="M4 19h2m3 0v-4m5 4v-8m5 8V6" />,
};

function Icon({
  name,
  size = 18,
}: {
  name: keyof typeof icons;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {icons[name]}
    </svg>
  );
}

function StatusDot({ status }: { status: FleetFilter }) {
  return (
    <span
      aria-hidden="true"
      className={`size-2 shrink-0 rounded-full ${statusMeta[status].dot}`}
    />
  );
}

const desktopMedia = "(min-width: 64rem)";

function subscribeToDesktop(onChange: () => void) {
  const media = window.matchMedia(desktopMedia);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function isDesktopViewport() {
  return window.matchMedia(desktopMedia).matches;
}

function ProfileMenu() {
  const user = useDashboardUser();
  const { role, canPreview, selectRole } = useDemoRole();

  if (!user) return null;

  function closeMenu(details: HTMLDetailsElement) {
    details.open = false;
    details.querySelector("summary")?.focus();
  }

  return (
    <details
      className="relative min-w-0"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        event.preventDefault();
        closeMenu(event.currentTarget);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          event.currentTarget.open = false;
      }}
    >
      <summary
        className={`flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl pr-1 hover:bg-[var(--fleet-quiet)] [&::-webkit-details-marker]:hidden ${focus}`}
      >
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full soft-inset border border-[var(--fleet-line)] bg-[var(--fleet-selected)] ${accent}`}
          aria-hidden="true"
        >
          <Icon name="user" size={20} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">
            {user.full_name}
          </span>
          <span title={user.company_name ?? undefined} aria-label={`บริษัท ${user.company_name ?? `Workspace ${user.company_id}`}`} className={`block max-w-[min(55vw,20rem)] truncate text-xs font-medium ${accent}`}>
            {user.company_name ?? `Workspace ${user.company_id}`}
          </span>
          <span
            className={`flex items-center gap-1 whitespace-nowrap text-[11px] ${muted}`}
          >
            {accountRoleLabels[user.role]}
          </span>
        </span>
        <span className={muted} aria-hidden="true">
          <Icon name="chevronDown" size={14} />
        </span>
      </summary>
      <div
        className={`${panel} absolute left-0 top-full z-10 mt-2 w-44 p-1.5`}
        role="group"
        aria-label="เมนูบัญชี"
      >
        <p className={`border-b border-[var(--fleet-line)] px-2 py-2 text-xs leading-relaxed wrap-anywhere ${muted}`}>{user.company_name ?? `Workspace ${user.company_id}`}</p>
        {canPreview && <p className={`px-2 py-1.5 text-xs font-semibold ${muted}`}>
          บทบาททดสอบ
        </p>}
        {canPreview && (["admin", "dispatch"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={role === option}
            onClick={(event) => {
              selectRole(option);
              const details = event.currentTarget.closest("details");
              if (details) closeMenu(details);
            }}
            className={`flex min-h-10 w-full cursor-pointer items-center justify-between rounded-xl px-2 text-left text-sm font-medium ${role === option ? `bg-[var(--fleet-selected)] ${accent}` : "hover:bg-[var(--fleet-quiet)]"} ${focus}`}
          >
            {demoRoleLabels[option]}
            {role === option && <Icon name="check" size={15} />}
          </button>
        ))}
        <form action={logout}>
          <button type="submit" className={`min-h-10 w-full cursor-pointer rounded-xl px-2 text-left text-sm font-medium hover:bg-[var(--fleet-quiet)] ${focus}`}>
            ออกจากระบบ
          </button>
        </form>
      </div>
    </details>
  );
}

type LayoutPanel = {
  id: MovablePanel;
  label: string;
  visible: boolean;
  disabled?: boolean;
  toggle: () => void;
};

const layoutOptions = {
  summary: { icon: "signal", position: "left-1/2 top-[8%] w-[38%] -translate-x-1/2" },
  list: { icon: "truck", position: "right-[5%] top-1/2 w-[32%] -translate-y-1/2" },
  details: { icon: "info", position: "left-1/2 bottom-[8%] w-[38%] -translate-x-1/2" },
  alerts: { icon: "bell", position: "left-[5%] top-1/2 w-[32%] -translate-y-1/2" },
} as const;

function LayoutMenu({ panels, toggleRef, alertsVisible }: {
  panels: LayoutPanel[];
  toggleRef: RefObject<HTMLButtonElement | null>;
  alertsVisible: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  function closeMenu() {
    dialog.current?.close();
  }

  return (
    <>
      <div className={`${panel} absolute right-3 top-[min(19.75rem,50dvh)] z-[47] p-1 lg:bottom-8 lg:right-4 lg:top-auto ${alertsVisible ? "max-lg:z-40" : ""}`}>
        <button
          ref={toggleRef}
          type="button"
          aria-controls="map-layout-panels"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="กางเมนูจัดหน้าจอ"
          title="จัดหน้าจอแผนที่"
          onClick={() => {
            dialog.current?.showModal();
            setOpen(true);
          }}
          className={`${control} size-11 px-0`}
        >
          <Icon name="layout" size={18} />
        </button>
      </div>

      <dialog
        ref={dialog}
        id="map-layout-panels"
        aria-labelledby="map-layout-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMenu();
        }}
        className="layout-wheel fixed inset-0 m-auto size-[min(20rem,calc(100vw-1.5rem),calc(100dvh-1.5rem))] max-h-none max-w-none overflow-visible bg-transparent p-0 text-[color:var(--fleet-text)] backdrop:bg-slate-950/40"
      >
        <div className="layout-wheel-surface relative size-full rounded-full border border-[var(--fleet-line)] bg-[var(--fleet-surface)] shadow-[var(--fleet-shadow-window)]">
          <h2 id="map-layout-title" className="sr-only">จัดหน้าจอแผนที่</h2>
          <span aria-hidden="true" className="pointer-events-none absolute inset-[16%] rounded-full border border-dashed border-[var(--fleet-line)]" />
          <button type="button" onClick={closeMenu} aria-label="ปิดเมนูจัดหน้าจอ" title="ปิดเมนูจัดหน้าจอ"
            className={`absolute left-1/2 top-1/2 z-10 grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full soft-control border border-[var(--fleet-line)] bg-[var(--fleet-surface)] hover:bg-[var(--fleet-selected)] ${focus}`}>
            <Icon name="close" size={18} />
          </button>
          {panels.map(({ id, label, visible, disabled, toggle }) => {
            const { icon, position } = layoutOptions[id];
            return (
              <button key={id} type="button" data-wheel-option={id} aria-pressed={visible} disabled={disabled}
                title={disabled ? "เลือกรถเพื่อดูรายละเอียด" : undefined}
                onClick={() => { closeMenu(); toggle(); }}
                className={`absolute flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full border px-1 py-1.5 text-center text-[11px] font-semibold leading-tight disabled:cursor-default disabled:opacity-55 sm:text-xs ${position} ${visible ? `soft-inset border-[var(--fleet-accent)]/30 bg-[var(--fleet-selected)] ${accent}` : `soft-control border-[var(--fleet-line)] bg-[var(--fleet-surface)] ${muted} hover:bg-[var(--fleet-quiet)]`} ${focus}`}>
                <Icon name={icon} size={16} />
                {label}
              </button>
            );
          })}
        </div>
      </dialog>
    </>
  );
}

const thumbnails: Record<
  VehicleCategory,
  { color: string; drawing: ReactNode }
> = {
  truck: {
    color: "text-[#419deb]",
    drawing: (
      <>
        <path d="M4 8h17v13H4z" opacity=".65" />
        <path d="M22 12h6l5 5v4H22z" />
        <path d="M24 13.5h3.1l3 3.3H24z" fill="var(--fleet-surface)" />
        <circle
          cx="10"
          cy="22"
          r="3"
          fill="var(--fleet-surface)"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle
          cx="27"
          cy="22"
          r="3"
          fill="var(--fleet-surface)"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </>
    ),
  },
  car: {
    color: "text-[#20ad91]",
    drawing: (
      <>
        <path d="m4 17 4-2 4-5h12l5 5 3 2v5H4z" />
        <path
          d="m10 15 3-3.3h4.5V15zm9.5 0v-3.3h3.7l3.4 3.3z"
          fill="var(--fleet-surface)"
        />
        <circle
          cx="10"
          cy="22"
          r="3"
          fill="var(--fleet-surface)"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle
          cx="27"
          cy="22"
          r="3"
          fill="var(--fleet-surface)"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </>
    ),
  },
  motorcycle: {
    color: "text-[#de922a]",
    drawing: (
      <>
        <circle
          cx="8"
          cy="21"
          r="4.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        />
        <circle
          cx="28"
          cy="21"
          r="4.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        />
        <path
          d="m8 21 5-7 5 7h-10m10 0 6-6-2.5-6H18m6 6 4 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M13 13h8l-3 5h-4l-3-4H7v-2h5z" />
      </>
    ),
  },
};

function VehicleThumbnail({ category }: { category: VehicleCategory | null }) {
  if (!category) return <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] ${muted}`}><Icon name="truck" size={24} /></span>;
  const { color, drawing } = thumbnails[category];
  return (
    <span
      aria-hidden="true"
      className={`grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] ${color}`}
    >
      <svg viewBox="0 0 36 32" width="30" height="27" fill="currentColor">
        {drawing}
      </svg>
    </span>
  );
}

function VehicleDetails({
  vehicle,
  onClose,
  moveHandle,
  active,
  expanded,
  onToggle,
}: {
  vehicle: FleetVehicle;
  onClose: () => void;
  moveHandle: ReactNode;
  active: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const updateTime =
    vehicle.updatedAt > 0 ? clock.format(vehicle.updatedAt) : "—";

  return (
    <section
      id="vehicle-detail"
      data-map-panel
      aria-label="รายละเอียดรถ"
      tabIndex={-1}
      className={`${panel} absolute inset-x-3 bottom-43 max-h-[42dvh] overflow-y-auto p-3.5 outline-none sm:bottom-28 sm:left-4 sm:right-auto sm:w-[18.5rem] lg:bottom-24 ${active ? "z-[46]" : "z-20"}`}
    >
      <div className={`flex items-center gap-2.5 ${expanded ? "pr-5" : ""}`}>
        <VehicleThumbnail category={vehicle.category} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold">{vehicle.plate}</h2>
          <p className={`mt-0.5 truncate text-[11px] ${muted}`}>
            {vehicle.kind} · {vehicle.id}
          </p>
        </div>
        {moveHandle}
        <MapPanelCollapse panelName="รายละเอียดรถ" controls="vehicle-detail-content" expanded={expanded} onToggle={onToggle} />
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดรายละเอียดรถ"
          className={`grid size-9 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-[var(--fleet-quiet)] ${muted} ${focus}`}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div id="vehicle-detail-content" hidden={!expanded}>
        <div className="my-3 flex items-center justify-between gap-2 rounded-lg bg-[var(--fleet-quiet)] px-2.5 py-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 ${muted}`}>
            <StatusDot status={vehicle.status} />
            {statusMeta[vehicle.status].label}
          </span>
          <span className="font-semibold tabular-nums">
            {vehicle.status === "offline"
              ? "—"
              : `${Math.round(vehicle.speed)} กม./ชม.`}
          </span>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-xs">
          <dt className={muted}>คนขับ</dt>
          <dd className="text-right font-semibold wrap-anywhere">
            {vehicle.driver}
          </dd>
          <dt className={muted}>พื้นที่</dt>
          <dd className="text-right font-semibold wrap-anywhere">
            {vehicle.area}
          </dd>
          <dt className={muted}>พิกัดล่าสุด</dt>
          <dd className="text-right font-mono tabular-nums">
            {vehicle.position[1].toFixed(4)}, {vehicle.position[0].toFixed(4)}
          </dd>
          <dt className={muted}>อัปเดตล่าสุด</dt>
          <dd className="text-right font-mono tabular-nums">{updateTime}</dd>
        </dl>
        <VehicleChatButton vehicleId={vehicle.id} demo />
        <details
          key={vehicle.id}
          className="mt-3 border-t border-[var(--fleet-line)] pt-1.5"
        >
          <summary
            className={`cursor-pointer rounded-md px-1 py-2 text-xs font-semibold ${accent} ${focus}`}
          >
            เส้นทางจำลอง
          </summary>
          <RoutePreview vehicle={vehicle} />
        </details>
      </div>
    </section>
  );
}

function RoutePreview({ vehicle }: { vehicle: FleetVehicle }) {
  const { route } = vehicle;
  if (route.length < 2) {
    return <p className={`py-3 text-xs ${muted}`}>รถคันนี้ไม่มีเส้นทางจำลอง</p>;
  }

  const longitudes = route.map(([longitude]) => longitude);
  const latitudes = route.map(([, latitude]) => latitude);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const scale = Math.min(
    228 / Math.max(east - west, 0.0001),
    108 / Math.max(north - south, 0.0001),
  );
  const project = ([longitude, latitude]: FleetVehicle["position"]) => [
    130 + (longitude - (east + west) / 2) * scale,
    67 + ((north + south) / 2 - latitude) * scale,
  ];
  const points = route.map((position) => project(position).join(",")).join(" ");
  const [x, y] = project(vehicle.position);

  return (
    <>
      <div className="mt-3 overflow-hidden rounded-lg border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] [background-image:linear-gradient(var(--fleet-line)_1px,transparent_1px),linear-gradient(90deg,var(--fleet-line)_1px,transparent_1px)] [background-size:22px_22px]">
        <svg
          className="block h-[8.25rem] w-full"
          viewBox="0 0 260 134"
          role="img"
          aria-label={`แผนผังเส้นทางจำลองของ ${vehicle.id} พร้อมตำแหน่งรถ`}
        >
          <polyline
            points={points}
            fill="none"
            stroke="var(--fleet-accent)"
            strokeWidth="7"
            strokeLinejoin="round"
            opacity=".16"
          />
          <polyline
            points={points}
            fill="none"
            stroke="var(--fleet-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle
            cx={x}
            cy={y}
            r="6"
            fill="var(--fleet-accent)"
            stroke="var(--fleet-surface)"
            strokeWidth="2"
          />
        </svg>
      </div>
      <p className={`mt-2 flex items-center gap-2 text-xs ${muted}`}>
        <span className="size-2 rounded-full bg-[var(--fleet-accent)]" />
        ตำแหน่งรถในเส้นทางจำลอง
      </p>
    </>
  );
}

export default function FleetDashboard() {
  const { theme, toggleTheme } = useAdminTheme();
  const account = useDashboardUser();
  const workspace = useFleetVehicles();
  const transport = useTransportJobs();
  const summary = useCompanySummary();
  const [demo, setDemo] = useState(false);
  const filters: FleetFilter[] = demo ? ["all", "moving", "parked", "offline"] : ["all", "active", "inactive", "maintenance"];
  const companyVehicles = useMemo(() => workspaceFleet(workspace.vehicles, workspace.types, workspace.drivers, transport.jobs), [workspace.vehicles, workspace.types, workspace.drivers, transport.jobs]);
  const companyVehicleIds = workspace.vehicles.map(({ vehicle_id }) => vehicle_id).sort().join(",");
  const gps = useFleetGps(account?.company_id ?? null, companyVehicleIds, !demo);
  const [view, setView] = useState<MapView>("3d");
  const [running, setRunning] = useState(true);
  const [simulation, setSimulation] = useState({ elapsed: 0, now: 0 });
  const [filter, setFilter] = useState<FleetFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOverride, setListOverride] = useState<boolean | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(true);
  const [listVisible, setListVisible] = useState(true);
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [alertsVisible, setAlertsVisible] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [alertsExpanded, setAlertsExpanded] = useState(true);
  const layoutToggle = useRef<HTMLButtonElement>(null);
  const [panelPositions, setPanelPositions] = useState<Partial<Record<MovablePanel, Offset>>>({});
  const [panelSizes, setPanelSizes] = useState<Partial<Record<MovablePanel, PanelSize>>>({});
  const [activePanel, setActivePanel] = useState<MovablePanel | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const [focusKey, setFocusKey] = useState(0);
  const isDesktop = useSyncExternalStore(
    subscribeToDesktop,
    isDesktopViewport,
    () => false,
  );
  const listOpen = listVisible && (listOverride ?? isDesktop);

  useEffect(() => {
    if (!demo || !running) return;
    let previousTick = performance.now();
    const interval = window.setInterval(() => {
      const currentTick = performance.now();
      const delta = (currentTick - previousTick) / 1000;
      previousTick = currentTick;
      setSimulation((previous) => ({
        elapsed: previous.elapsed + delta,
        now: previous.now > 0 ? previous.now + delta * 1000 : Date.now(),
      }));
    }, 240);
    return () => window.clearInterval(interval);
  }, [demo, running]);

  const fleet = useMemo(
    () => demo ? getDemoFleet(simulation.elapsed, simulation.now) : [],
    [demo, simulation],
  );
  const counts: Record<FleetFilter, number> = { all: demo ? fleet.length : companyVehicles.length, moving: 0, parked: 0, offline: 0, active: 0, inactive: 0, maintenance: 0 };
  for (const vehicle of fleet) counts[vehicle.status] += 1;
  for (const vehicle of companyVehicles) counts[vehicle.record.vehicle_status] += 1;

  const normalizedQuery = query.trim().toLocaleLowerCase("th-TH");
  const visibleVehicles = fleet.filter((vehicle) => {
    if (filter !== "all" && vehicle.status !== filter) return false;
    return [
      vehicle.id,
      vehicle.plate,
      vehicle.name,
      vehicle.driver,
      vehicle.kind,
      vehicle.area,
    ].some((value) =>
      value.toLocaleLowerCase("th-TH").includes(normalizedQuery),
    );
  });
  const selectedVehicle = visibleVehicles.find(
    (vehicle) => vehicle.id === selectedId,
  );
  const visibleCompanyVehicles = companyVehicles.filter((vehicle) => (filter === "all" || vehicle.record.vehicle_status === filter) && [vehicle.code, vehicle.plate, vehicle.typeName, vehicle.driverName].some((value) => value.toLocaleLowerCase("th-TH").includes(normalizedQuery)));
  const selectedCompanyVehicle = demo ? undefined : visibleCompanyVehicles.find((vehicle) => vehicle.id === selectedId);
  const mapVehicles = demo ? visibleVehicles : visibleCompanyVehicles.flatMap((vehicle) => {
    const point = gps.points.get(vehicle.id);
    const marker = point && mapVehicleForFix(vehicle, point, Boolean(gps.error));
    return marker ? [marker] : [];
  });
  const selectedCount = demo ? visibleVehicles.length : visibleCompanyVehicles.length;
  const offlineVehicles = fleet.filter(
    (vehicle) => vehicle.status === "offline",
  );
  const showDetails =
    detailsVisible && (selectedVehicle || selectedCompanyVehicle) && (isDesktop || (!listOpen && !alertsVisible));
  const alerts = alertsVisible
    ? demo ? getDemoAlerts(fleet, simulation.now, simulation.now > 0 ? simulation.now - simulation.elapsed * 1000 : null) : jobProblemAlerts(transport.jobs)
    : [];
  const overlayInsets = {
    top: summaryVisible ? (summaryExpanded ? (demo ? 180 : 240) : 78) : 32,
    right: isDesktop && alertsVisible ? 368 : isDesktop && listOpen ? 330 : 56,
    bottom: isDesktop
      ? 96
      : listOpen || (alertsVisible && alertsExpanded)
        ? 472
        : showDetails
          ? (detailsExpanded ? 440 : 240)
          : listVisible
            ? 166
            : 96,
    left: isDesktop && showDetails ? 310 : 0,
  };

  function selectVehicle(id: string) {
    setSelectedId(id);
    setFocusKey((key) => key + 1);
    if (!isDesktop) setListOverride(false);
  }

  function inspectOffline(id: string) {
    setQuery("");
    setFilter("offline");
    selectVehicle(id);
  }

  function closeAlerts() {
    setAlertsVisible(false);
    layoutToggle.current?.focus({ preventScroll: true });
  }

  function panelHandle(id: MovablePanel, label: string, expanded: boolean) {
    return <MapPanelHandle label={label} position={panelPositions[id]} size={panelSizes[id]} expanded={expanded}
      corner={id === "summary" ? "bottom-right" : id === "details" ? "top-right" : "left"}
      maxWidth={id === "list" ? 440 : undefined}
      onActivate={() => setActivePanel(id)}
      onPositionChange={(position) => setPanelPositions((previous) => ({ ...previous, [id]: position }))}
      onSizeChange={(size) => setPanelSizes((previous) => ({ ...previous, [id]: size }))} />;
  }

  function inspectAlert(id: string) {
    setAlertsVisible(false);
    setQuery("");
    setFilter("all");
    setDetailsVisible(true);
    setDetailsExpanded(true);
    selectVehicle(id);
    requestAnimationFrame(() => {
      document.getElementById("vehicle-detail")?.focus({ preventScroll: true });
    });
  }

  function reloadCompany() { workspace.refresh(); transport.refresh(); summary.refresh(); gps.refresh(); }
  function toggleDemo() { setDemo(!demo); setSelectedId(null); setFilter("all"); setQuery(""); setRunning(true); setSimulation({ elapsed: 0, now: 0 }); }

  return (
    <main className="relative isolate h-full overflow-clip selection:bg-[var(--fleet-selected)] selection:text-[color:var(--fleet-text)]">
      <section aria-label="แผนที่รถ" className="absolute inset-0">
        <FleetMap
          vehicles={mapVehicles}
          selectedId={selectedVehicle?.id ?? selectedCompanyVehicle?.id ?? null}
          onSelect={selectVehicle}
          theme={theme}
          view={view}
          recenterKey={recenterKey}
          focusKey={focusKey}
          overlayInsets={overlayInsets}
        />
      </section>

      {!demo && !mapVehicles.length && !selectedCompanyVehicle && (
        <div role="status" className="pointer-events-none absolute top-1/2 left-1/2 z-10 w-[min(18rem,80vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--fleet-line)] bg-[var(--fleet-surface)]/95 p-4 text-center text-sm shadow-sm">
          <p className="font-semibold">{gps.error ?? (workspace.loading || gps.loading ? "กำลังโหลดตำแหน่ง GPS…" : "ยังไม่มีพิกัด GPS ที่แสดงได้")}</p>
          {workspace.checkedAt && companyVehicles.length > 0 && !gps.error && !gps.loading && (
            <p className={`mt-1 text-xs leading-relaxed ${muted}`}>{visibleCompanyVehicles.length ? "เมื่อรถส่งพิกัด ระบบจะแสดงตำแหน่งบนแผนที่" : "ลองเปลี่ยนตัวกรองรายการรถ"}</p>
          )}
        </div>
      )}

      <div data-map-drag-bounds aria-hidden="true" className="pointer-events-none absolute inset-x-1 top-[max(0.25rem,env(safe-area-inset-top))] bottom-[calc(5.5rem+env(safe-area-inset-bottom))]" />
      <p id="map-panel-drag-help" className="sr-only">ใช้ปุ่มลูกศรเพื่อขยับแผง หรือกด Home เพื่อคืนตำแหน่งเริ่มต้น</p>
      <p id="map-panel-resize-help" className="sr-only">ลากที่มุมแผงหรือใช้ปุ่มลูกศรเพื่อปรับขนาด กด Home เพื่อคืนขนาดและตำแหน่งเริ่มต้น</p>

      <header
        data-map-panel
        className={`${panel} absolute inset-x-3 top-3 max-h-[calc(100dvh-6rem)] data-[panel-sized=true]:overflow-y-auto sm:left-4 sm:right-auto sm:top-4 sm:w-[24rem] ${activePanel === "summary" ? "z-[46]" : "z-20"} ${summaryVisible ? "" : "hidden"}`}
      >
        <div className="flex items-center justify-between gap-2 px-2.5 py-2.5 sm:px-3">
          <h1 className="sr-only">VAYRO ติดตามตำแหน่งรถ</h1>
          <ProfileMenu />
          <div className="flex shrink-0 items-center">
            {panelHandle("summary", "ย้ายแผงสรุปสถานะ", summaryExpanded)}
            <MapPanelCollapse panelName="สรุปสถานะ" controls="fleet-summary-content" expanded={summaryExpanded} onToggle={() => setSummaryExpanded(!summaryExpanded)} />
          </div>
        </div>

        <div id="fleet-summary-content" hidden={!summaryExpanded}>
          {!demo && account?.role === "company_admin" && <dl aria-label="ข้อมูลบริษัทจากฐานข้อมูลจริง" className="mx-3 mb-2 grid grid-cols-3 gap-2 border-y border-[var(--fleet-line)] py-2 text-center"><div><dt className={`text-[10px] ${muted}`}>พนักงาน</dt><dd className="mt-0.5 text-sm font-bold tabular-nums">{summary.data?.employees.total ?? "—"} <span className={`text-[10px] font-normal ${muted}`}>คน</span></dd></div><div><dt className={`text-[10px] ${muted}`}>รถ</dt><dd className="mt-0.5 text-sm font-bold tabular-nums">{workspace.checkedAt ? companyVehicles.length : "—"} <span className={`text-[10px] font-normal ${muted}`}>คัน</span></dd></div><div><dt className={`text-[10px] ${muted}`}>งาน</dt><dd className="mt-0.5 text-sm font-bold tabular-nums">{summary.data?.jobs.total ?? "—"} <span className={`text-[10px] font-normal ${muted}`}>งาน</span></dd></div></dl>}
          {!demo && (workspace.error || summary.error) && <p role="alert" className="px-3 pb-2 text-[11px] leading-relaxed text-[var(--fleet-accent)]">{workspace.error ? fleetErrorMessage(workspace.error) : "โหลดสรุปไม่สำเร็จ กรุณาโหลดใหม่"}{workspace.checkedAt ? " · รายการรถเป็นชุดล่าสุดที่โหลดสำเร็จ" : ""}</p>}
          <div
            role="group"
            aria-label="กรองตามสถานะรถ"
            className="grid grid-cols-4 gap-1.5 px-2.5 py-px sm:gap-2 sm:px-3"
          >
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={filter === item}
                onClick={() => setFilter(item)}
                className={`flex min-h-11 min-w-0 cursor-pointer flex-col items-center justify-center rounded-[var(--fleet-radius)] border px-0.5 py-1 ${filter === item ? "soft-inset border-[var(--fleet-accent)]/30 bg-[var(--fleet-selected)]" : "soft-control border-[var(--fleet-line)] bg-[var(--fleet-surface)] hover:bg-[var(--fleet-quiet)]"} ${focus} focus-visible:outline-offset-[-2px]`}
              >
                <span className="flex items-center gap-1.5 font-mono text-base font-bold leading-5 tabular-nums">
                  <StatusDot status={item} />
                  {demo || workspace.checkedAt ? counts[item] : "—"}
                </span>
                <span
                  className={`whitespace-nowrap text-[10px] font-medium ${muted}`}
                >
                  {statusMeta[item].label}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1 py-1.5 pl-2.5 pr-6 sm:pl-3">
            <span
              className={`flex shrink-0 items-center gap-1 text-[10px] sm:text-[11px] ${muted}`}
            >
              <span className="hidden min-[360px]:block"><Icon name="map" size={13} /></span>
              {demo ? "ข้อมูลจำลอง" : "ทะเบียนรถจริง"}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {demo && <button type="button" onClick={() => setRunning(!running)}
                aria-label={running ? "หยุดการจำลอง" : "เล่นการจำลองต่อ"}
                title={running ? "หยุดการจำลอง" : "เล่นการจำลองต่อ"}
                className={`${control} h-10 w-9 px-0`}>
                <Icon name={running ? "pause" : "play"} size={16} />
              </button>}
              {!demo && <button type="button" onClick={reloadCompany} disabled={workspace.loading || summary.loading} aria-label="โหลดข้อมูลบริษัทใหม่" title="โหลดข้อมูลบริษัทใหม่" className={`${control} h-10 w-9 px-0 disabled:opacity-50`}><Icon name="fit" size={16} /></button>}
              <button type="button" onClick={toggleTheme} aria-label="โหมดมืด" aria-pressed={theme === "dark"}
                title={theme === "dark" ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด"} className={`${control} h-10 w-9 px-0`}>
                <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
              </button>
            </div>
            <button type="button" onClick={toggleDemo} aria-pressed={demo} className={`min-h-9 rounded-lg px-2 text-[11px] font-semibold hover:bg-[var(--fleet-selected)] ${accent} ${focus}`}>{demo ? "กลับข้อมูลจริง" : "ดูเดโม 3D"}</button>
            <div className="flex items-center gap-1.5">
              <div
                role="group"
                aria-label="มุมมองแผนที่"
                className="flex items-center rounded-lg soft-inset border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] p-0.5"
              >
                {(["2d", "3d"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setView(mode)}
                    aria-pressed={view === mode}
                    className={`min-h-8 min-w-9 cursor-pointer rounded-md px-1 font-mono text-xs font-semibold ${view === mode ? `bg-[var(--fleet-selected)] ${accent}` : muted} ${focus}`}
                  >
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRecenterKey((key) => key + 1)}
                aria-label="จัดมุมมองให้เห็นรถทั้งหมด"
                title="จัดมุมมองให้เห็นรถทั้งหมด"
                disabled={mapVehicles.length === 0}
                className={`${control} size-9 min-h-9 px-0 disabled:cursor-default disabled:opacity-50`}
              >
                <Icon name="fit" size={16} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <aside
        className={`pointer-events-none absolute inset-x-3 bottom-27 sm:left-auto sm:right-4 sm:w-[19.5rem] lg:bottom-auto lg:top-4 ${activePanel === "list" ? "z-[46]" : "z-30"} ${listVisible ? "" : "hidden"}`}
      >
        <section
          data-map-panel
          aria-labelledby="fleet-heading"
          className={`${panel} relative ml-auto overflow-hidden ${listOpen ? `flex flex-col lg:max-h-[calc(100dvh-13rem)] ${alertsVisible ? "max-lg:max-h-[min(12rem,30dvh)]" : "max-lg:max-h-[min(23rem,50dvh)]"}` : "w-fit"}`}
        >
          <div className={`flex shrink-0 items-center gap-1 px-3 py-2.5 ${listOpen ? "max-lg:pl-9" : ""}`}>
            <h2
              id="fleet-heading"
              className="mr-auto flex items-center gap-2 text-sm font-bold"
            >
              <span className={accent}>
                <Icon name="truck" size={18} />
              </span>
              รายการรถ
              <span
                aria-live="polite"
                className={`rounded-md bg-[var(--fleet-quiet)] px-1.5 py-1 text-xs font-medium tabular-nums ${muted}`}
              >
                {demo || workspace.checkedAt ? `${selectedCount}/${counts.all}` : "—"}
              </span>
            </h2>
            {panelHandle("list", "ย้ายแผงรายการรถ", listOpen)}
            <MapPanelCollapse panelName="รายการรถ" controls="fleet-list-content" expanded={listOpen} onToggle={() => setListOverride(!listOpen)} />
          </div>

          <div
            id="fleet-list-content"
            hidden={!listOpen}
            className={listOpen ? "flex min-h-0 flex-col" : ""}
          >
            <div className="shrink-0 px-3 pb-2.5">
              <label className="relative block">
                <span className="sr-only">ค้นหาทะเบียน ประเภทรถ หรือคนขับ</span>
                <span
                  className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${muted}`}
                >
                  <Icon name="search" size={15} />
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ค้นหาทะเบียน ประเภทรถ หรือคนขับ"
                  className={`h-10 w-full rounded-lg soft-inset border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] pl-9 pr-2 text-base placeholder:text-[color:var(--fleet-muted)] sm:text-sm ${focus}`}
                />
              </label>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain border-t border-[var(--fleet-line)] px-2 py-1.5 [scrollbar-color:var(--fleet-line)_transparent]">
              {!demo ? <>
                {workspace.error && <p role="alert" className="px-2 py-2 text-xs leading-relaxed text-[var(--fleet-accent)]">{fleetErrorMessage(workspace.error)}</p>}
                {!workspace.checkedAt ? <p role="status" className={`p-4 text-center text-xs ${muted}`}>{workspace.loading ? "กำลังโหลดรถของบริษัท…" : "โหลดรายการรถไม่ได้ กรุณากดโหลดข้อมูลบริษัทใหม่"}</p> : visibleCompanyVehicles.length ? <ul className="space-y-0.5">{visibleCompanyVehicles.map((vehicle) => <li key={vehicle.id}><button type="button" aria-label={`${vehicle.plate} ${vehicle.typeName} ${vehicle.code} ${vehicleStatusLabels[vehicle.record.vehicle_status]}`} aria-pressed={selectedCompanyVehicle?.id === vehicle.id} onClick={() => selectVehicle(vehicle.id)} className={`flex min-h-14 w-full items-center gap-2 rounded-lg px-1.5 py-2 text-left ${selectedCompanyVehicle?.id === vehicle.id ? "bg-[var(--fleet-selected)]" : "hover:bg-[var(--fleet-quiet)]"} ${focus}`}><VehicleThumbnail category={vehicle.category} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{vehicle.plate}</span><span className={`mt-0.5 block truncate text-[10px] ${muted}`}>{vehicle.typeName} · {vehicle.code}</span><span className={`mt-0.5 block truncate text-[10px] ${muted}`}>{vehicle.driverName}</span></span><span className={`inline-flex shrink-0 items-center gap-1 text-[10px] ${muted}`}><StatusDot status={vehicle.record.vehicle_status} />{vehicleStatusLabels[vehicle.record.vehicle_status]}</span></button></li>)}</ul> : <div className={`p-4 text-center text-xs ${muted}`}><p>{companyVehicles.length ? "ไม่พบรถที่ตรงกับตัวกรอง" : "ยังไม่มีรถในบริษัท"}</p>{companyVehicles.length > 0 && <button type="button" onClick={() => { setQuery(""); setFilter("all"); }} className={`mt-2 min-h-10 rounded-lg px-3 underline ${focus}`}>ล้างตัวกรอง</button>}</div>}
                <p className={`mt-2 border-t border-[var(--fleet-line)] px-2 py-3 text-[11px] leading-relaxed ${muted}`}>
                  {gps.error ? `${gps.error}${gps.points.size ? " · แสดงพิกัดจากรอบก่อน" : ""}` : gps.loading ? "กำลังโหลดตำแหน่ง GPS…" : `แสดงพิกัด ${mapVehicles.length} จาก ${visibleCompanyVehicles.length} คัน · หมุดสีเทาคือพิกัดเก่า`}
                </p>
              </> : visibleVehicles.length ? (
                <ul className="space-y-0.5">
                  {visibleVehicles.map((vehicle) => (
                    <li key={vehicle.id}>
                      <button
                        type="button"
                        onClick={() => selectVehicle(vehicle.id)}
                        aria-pressed={selectedVehicle?.id === vehicle.id}
                        className={`flex min-h-14 w-full cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-left ${selectedVehicle?.id === vehicle.id ? "bg-[var(--fleet-selected)]" : "hover:bg-[var(--fleet-quiet)]"} ${focus} focus-visible:outline-offset-[-2px]`}
                      >
                        <VehicleThumbnail category={vehicle.category} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold sm:text-[13px]">
                            {vehicle.plate}
                          </span>
                          <span
                            className={`mt-0.5 block truncate text-[11px] ${muted}`}
                          >
                            {vehicle.kind} · {vehicle.area}
                          </span>
                        </span>
                        <span
                          title={statusMeta[vehicle.status].label}
                          className={`inline-flex shrink-0 items-center gap-1 text-[10px] ${muted}`}
                        >
                          <StatusDot status={vehicle.status} />
                          <span className="sr-only min-[360px]:not-sr-only">
                            {statusMeta[vehicle.status].label}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-3 py-5 text-center text-xs">
                  <p>ไม่พบรถที่ตรงกับการค้นหา</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                    className={`mt-2 min-h-9 cursor-pointer rounded-md px-3 font-semibold underline underline-offset-4 ${accent} ${focus}`}
                  >
                    ล้างตัวกรอง
                  </button>
                </div>
              )}
              {demo && <details className="mt-1.5 border-t border-[var(--fleet-line)] px-1.5">
                <summary
                  className={`cursor-pointer rounded-md px-1 py-2.5 text-xs font-semibold ${muted} ${focus}`}
                >
                  สัญญาณ GPS · ขาดสัญญาณ {counts.offline} คัน
                </summary>
                {offlineVehicles.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => inspectOffline(vehicle.id)}
                    className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-1.5 text-left text-xs hover:bg-[var(--fleet-quiet)] ${focus}`}
                  >
                    <Icon name="signal" size={15} />
                    <span className="min-w-0 flex-1">
                      <strong className="block">{vehicle.plate}</strong>
                      <span className={`block ${muted}`}>
                        พิกัดล่าสุด{" "}
                        {vehicle.updatedAt > 0
                          ? clock.format(vehicle.updatedAt)
                          : "—"}
                      </span>
                    </span>
                    <Icon name="chevron" size={14} />
                  </button>
                ))}
              </details>}
            </div>
          </div>
        </section>
      </aside>

      {showDetails && selectedVehicle && (
        <VehicleDetails
          vehicle={selectedVehicle}
          onClose={() => setSelectedId(null)}
          moveHandle={panelHandle("details", "ย้ายแผงรายละเอียดรถ", detailsExpanded)}
          active={activePanel === "details"}
          expanded={detailsExpanded}
          onToggle={() => setDetailsExpanded(!detailsExpanded)}
        />
      )}
      {showDetails && selectedCompanyVehicle && <WorkspaceVehicleDetails vehicle={selectedCompanyVehicle} gpsPoint={gps.points.get(selectedCompanyVehicle.id)} gpsLoading={gps.loading} gpsError={gps.error} jobs={transport.jobs} jobsLoading={transport.loading} jobsError={transport.error} onClose={() => setSelectedId(null)} moveHandle={panelHandle("details", "ย้ายแผงรายละเอียดรถ", detailsExpanded)} active={activePanel === "details"} expanded={detailsExpanded} onToggle={() => setDetailsExpanded(!detailsExpanded)} thumbnail={<VehicleThumbnail category={selectedCompanyVehicle.category} />} />}
      {alertsVisible && (
        <FleetAlertsPanel alerts={alerts} onClose={closeAlerts} onSelect={inspectAlert} demo={demo} loading={!demo && transport.loading} error={demo ? null : transport.error}
          moveHandle={panelHandle("alerts", "ย้ายแผงแจ้งเตือน", alertsExpanded)} active={activePanel === "alerts"}
          listWidth={listOpen ? panelSizes.list?.width : undefined}
          expanded={alertsExpanded} onToggle={() => setAlertsExpanded(!alertsExpanded)}
          listLayout={listOpen ? "expanded" : listVisible ? "collapsed" : "hidden"} />
      )}
      <LayoutMenu
        toggleRef={layoutToggle}
        alertsVisible={alertsVisible}
        panels={[
          {
            id: "summary",
            label: "สรุปสถานะ",
            visible: summaryVisible,
            toggle: () => setSummaryVisible(!summaryVisible),
          },
          {
            id: "list",
            label: "รายการรถ",
            visible: listVisible,
            toggle: () => {
              setListVisible(!listVisible);
              if (!listVisible) setListOverride(true);
            },
          },
          {
            id: "details",
            label: "รายละเอียดรถ",
            visible: Boolean(showDetails),
            disabled: !selectedVehicle && !selectedCompanyVehicle,
            toggle: () => {
              setDetailsVisible(!showDetails);
              if (!isDesktop && !showDetails) setListOverride(false);
            },
          },
          {
            id: "alerts",
            label: "แจ้งเตือน",
            visible: alertsVisible,
            toggle: () => setAlertsVisible(!alertsVisible),
          },
        ]}
      />
    </main>
  );
}
