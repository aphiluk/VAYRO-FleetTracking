"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { AuthenticatedUser, TransportJobRecord, NavigationRoute, ApiResponse } from "../../../../packages/shared-types";
import { logout } from "@/lib/auth-actions";
import { transportErrorMessage, useTransportJobs, type JobAction } from "@/lib/transport-client";
import { formatJobTime, jobDateKey, jobPlaces } from "@/lib/transport-format";
import NavigationRouteMap from "../dashboard/_map/navigation-route-map";
import DriverHome from "./driver-home";
import DriverFinishSlider from "./driver-finish-slider";
import DriverMapSheet from "./driver-map-sheet";
import DriverMessages, { UnreadCount, useDriverMessages } from "./driver-messages";
import { focus, Icon, JobList, muted, primaryButton, Status, surface, type DriverJobEntry } from "./driver-ui";

const views = [
  { id: "home", icon: "home", label: "หน้าแรก" },
  { id: "jobs", icon: "box", label: "งาน" },
  { id: "messages", icon: "chat", label: "ข้อความ" },
  { id: "history", icon: "clock", label: "ประวัติ" },
] as const;
type View = (typeof views)[number]["id"];
const activeStatuses = ["accepted", "in_progress", "problem"];
const closedStatuses = ["completed", "cancelled"];
const secondary = `min-h-11 rounded-xl border border-[var(--fleet-line)] px-3 text-sm font-semibold hover:bg-[var(--fleet-quiet)] disabled:opacity-50 ${focus}`;

export default function DriverWorkspace({ user, initialNow }: { user: Pick<AuthenticatedUser, "user_id" | "full_name" | "email" | "company_id" | "company_name">; initialNow: string }) {
  const { jobs, loading, error, pending, refresh, actOnJob } = useTransportJobs();
  const chat = useDriverMessages(user.company_id, user.user_id);
  const [view, setView] = useState<View>("home");
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(initialNow);
  const [confirmAction, setConfirmAction] = useState<"start" | "complete" | "problem">("start");
  const [problem, setProblem] = useState("");
  const confirmation = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLElement>(null);
  const entries: DriverJobEntry[] = jobs.map((job) => ({ job, status: job.job_status, completedAt: job.actual_end_at ?? undefined }));
  const selected = entries.find(({ job }) => job.job_id === selectedId);
  const active = entries.find(({ status }) => activeStatuses.includes(status));
  const open = entries.filter(({ status }) => !closedStatuses.includes(status));
  const closed = entries.filter(({ status }) => closedStatuses.includes(status));

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date().toISOString()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { content.current?.querySelector<HTMLElement>("[data-driver-heading]")?.focus({ preventScroll: true }); }, [view, selectedId, mapMode, chat.selected?.vehicle.id]);

  function pickView(next: View) { chat.openThread(null); setView(next); setSelectedId(null); setMapMode(false); setFilter("open"); window.scrollTo(0, 0); }
  function openJob(entry: DriverJobEntry) { setSelectedId(entry.job.job_id); setView(closedStatuses.includes(entry.status) ? "history" : "jobs"); setMapMode(activeStatuses.includes(entry.status)); window.scrollTo(0, 0); }
  function ask(action: typeof confirmAction) { setConfirmAction(action); setProblem(""); confirmation.current?.showModal(); }
  async function act(action: JobAction) {
    if (!selected || pending) return;
    const result = await actOnJob(selected.job.job_id, action, problem.trim());
    if (!result.ok) { setMessage(transportErrorMessage(result.code)); setMapMode(false); return; }
    confirmation.current?.close();
    setMessage(action === "problem" ? "แจ้งปัญหาให้ผู้จัดการงานแล้ว" : action === "complete" ? "จบงานและบันทึกประวัติแล้ว" : action === "accept" ? "รับงานแล้ว" : "เริ่มทำงานแล้ว");
    if (action === "accept" || action === "start") setMapMode(true);
    if (action === "complete") { setMapMode(false); setView("history"); }
  }
  const notice = <div className="space-y-2" aria-live="polite">
    {(error || message) && <p role={error ? "alert" : "status"} className="rounded-xl bg-[var(--fleet-selected)] p-3 text-sm leading-relaxed text-[var(--fleet-accent)]">{error ? transportErrorMessage(error) : message}</p>}
    <button type="button" disabled={loading || pending} onClick={refresh} className={secondary}>{loading ? "กำลังโหลดงาน…" : "โหลดงานใหม่"}</button>
  </div>;

  return <main ref={content} className="driver-page min-h-dvh text-foreground selection:bg-[var(--fleet-selected)] selection:text-[var(--fleet-accent)]">
    {mapMode && selected && activeStatuses.includes(selected.status) ? <JobMap key={selected.job.job_id} entry={selected} pending={pending} onBack={() => setMapMode(false)} onStart={() => ask("start")} onFinish={() => void act("complete")} onConfirmFinish={() => ask("complete")} onProblem={() => ask("problem")} notice={notice} menu={<DriverMenu view={view} onPick={pickView} unread={chat.unread} />} /> : <>
      <header className="flex justify-center px-4 pt-5 sm:pt-7"><span role="img" aria-label="VAYRO" className="soft-card grid size-12 place-items-center bg-[var(--fleet-highlight)] text-[var(--fleet-accent)]"><Icon name="brand" className="size-7" /></span></header>
      <div className="mx-auto max-w-5xl space-y-4 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6">
        {view === "messages" ? <DriverMessages chat={chat} /> : <>
        {notice}
        {loading && !jobs.length && <p role="status" className="py-6 text-center text-sm text-[var(--fleet-muted)]">กำลังโหลดข้อมูลจาก Transport…</p>}{view === "home" && !(loading && !jobs.length) && <DriverHome user={user} now={now} active={active} today={entries.filter(({ job }) => job.scheduled_start_at && jobDateKey(job.scheduled_start_at) === jobDateKey(now))} openJob={openJob} openJobs={() => pickView("jobs")} unread={chat.unread} openMessages={() => pickView("messages")} />}
        {view !== "home" && selected && <article className="space-y-4" aria-labelledby="driver-job-title">
          <section className={`${surface} p-4 sm:p-6`}><button type="button" onClick={() => setSelectedId(null)} className={`${secondary} mb-3`}>กลับไป{view === "history" ? "ประวัติ" : "งานของฉัน"}</button><div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><h1 id="driver-job-title" data-driver-heading tabIndex={-1} className="text-2xl font-bold break-words">{selected.job.job_name ?? selected.job.job_code}</h1><p className={`mt-1 font-mono text-xs ${muted}`}>{selected.job.job_code}</p></div><Status status={selected.status} /></div></section>
          <JobInformation job={selected.job} />
          {!closedStatuses.includes(selected.status) && <div className={`${surface} space-y-3 p-4`}>
            {selected.status === "assigned" ? <><p className={`text-sm ${muted}`}>{active ? `จัดการงาน ${active.job.job_code} ที่รับอยู่ก่อนรับงานนี้` : "ตรวจรถ จุดรับ และจุดส่งก่อนรับงาน"}</p><button type="button" disabled={pending || Boolean(active)} onClick={() => void act("accept")} className={`${primaryButton} w-full`}>{pending ? "กำลังบันทึก…" : "รับงาน"}</button></> : activeStatuses.includes(selected.status) ? <button type="button" onClick={() => setMapMode(true)} className={`${primaryButton} w-full`}>เปิดแผนที่งาน</button> : <p className={`text-sm ${muted}`}>รอผู้จัดการมอบหมายรถและคนขับให้ครบ</p>}
          </div>}
        </article>}
        {view !== "home" && !selected && <div className="space-y-4"><h1 data-driver-heading tabIndex={-1} className="text-3xl font-bold">{view === "history" ? "ประวัติการทำงาน" : "งานของฉัน"}</h1>{view === "jobs" && <div role="group" aria-label="สถานะงาน" className={`${surface} grid max-w-md grid-cols-2 gap-1.5 p-1.5`}>{([{ id: "open", label: "มอบหมายแล้ว", count: open.length }, { id: "closed", label: "จบ / ยกเลิก", count: closed.length }] as const).map((tab) => <button key={tab.id} type="button" aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)} className={`min-h-12 rounded-2xl text-sm font-bold ${focus} ${filter === tab.id ? "bg-[var(--fleet-selected)] text-[var(--fleet-accent)]" : muted}`}>{tab.label} · {tab.count}</button>)}</div>}<section className={`${surface} p-3 sm:p-4`}><JobList entries={view === "history" || filter === "closed" ? closed : open} onOpen={openJob} empty={loading ? "กำลังโหลดงาน…" : error ? "ยังโหลดงานไม่ได้ กรุณากดโหลดงานใหม่" : "ยังไม่มีงานในรายการนี้"} /></section></div>}
        </>}
      </div><DriverMenu view={view} onPick={pickView} unread={chat.unread} floating />
    </>}
    <dialog ref={confirmation} aria-labelledby="driver-confirm-title" className="soft-window m-auto w-[calc(100%_-_2rem)] max-w-md border border-[var(--fleet-line)] bg-[var(--fleet-surface)] p-5 text-foreground backdrop:bg-neutral-900/45">
      <h2 id="driver-confirm-title" className="text-xl font-bold">{confirmAction === "complete" ? "ยืนยันจบงาน" : confirmAction === "problem" ? "แจ้งปัญหางาน" : selected?.status === "problem" ? "กลับมาทำงานต่อ" : "ตรวจรถก่อนเริ่มงาน"}</h2>
      {selected && <p className={`mt-3 text-sm leading-relaxed ${muted}`}>{selected.job.job_code} · ทะเบียน {selected.job.vehicle?.license_plate ?? "ไม่ระบุ"}</p>}
      {confirmAction === "complete" && <p className={`mt-2 text-sm ${muted}`}>ยืนยันว่าส่งสินค้าและทำงานเสร็จแล้ว ระบบยังไม่ตรวจตำแหน่ง GPS</p>}
      {confirmAction === "problem" && <label className="mt-3 grid gap-2 text-sm font-semibold">รายละเอียดปัญหา<textarea value={problem} onChange={(e) => setProblem(e.target.value)} maxLength={1000} rows={4} className={`w-full rounded-xl border border-[var(--fleet-line)] p-3 text-base ${focus}`} /></label>}
      {message && <p role="status" className="mt-2 text-sm text-[var(--fleet-accent)]">{message}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={pending} onClick={() => confirmation.current?.close()} className={secondary}>ยกเลิก</button><button type="button" disabled={pending || (confirmAction === "problem" && !problem.trim())} onClick={() => void act(confirmAction)} className={primaryButton}>{pending ? "กำลังบันทึก…" : confirmAction === "problem" ? "ส่งแจ้งปัญหา" : confirmAction === "complete" ? "ยืนยันจบงาน" : "ยืนยันเริ่มงาน"}</button></div>
    </dialog>
  </main>;
}

function JobInformation({ job }: { job: TransportJobRecord }) {
  return <div className="grid min-w-0 gap-4 md:grid-cols-2">
    <section className={`${surface} min-w-0 space-y-3 p-4 sm:p-5`}><h2 className="flex items-center gap-2 font-bold"><Icon name="truck" />รถที่ได้รับมอบหมาย</h2><div className="flex items-center gap-3 rounded-xl bg-[var(--fleet-quiet)] p-3"><Icon name="truck" className="size-12 shrink-0 text-[var(--fleet-accent)]" /><div className="min-w-0 break-words"><p className="text-lg font-bold">{job.vehicle?.license_plate ?? "ยังไม่ระบุรถ"}</p><p className={`text-sm ${muted}`}>{job.vehicle?.vehicle_type_name ?? "ไม่ระบุประเภทรถ"}</p><p className={`font-mono text-xs ${muted}`}>{job.vehicle?.vehicle_code}</p></div></div><p className={`text-xs ${muted}`}>ยังไม่มีรูปภาพรถในระบบ</p><h2 className="flex items-center gap-2 font-bold"><Icon name="box" />สิ่งที่ส่ง</h2><p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{job.cargo_description ?? "ไม่ระบุรายการสินค้า"}</p></section>
    <section className={`${surface} min-w-0 space-y-3 p-4 sm:p-5`}><h2 className="flex items-center gap-2 font-bold"><Icon name="route" />เส้นทางขนส่ง</h2><ol className="space-y-3"><li><p className={`text-xs ${muted}`}>A · จุดรับสินค้า</p><p className="text-sm leading-relaxed break-words">{job.pickup_address}</p></li><li><p className={`text-xs ${muted}`}>B · จุดส่งสินค้า</p><p className="text-sm leading-relaxed break-words">{job.delivery_address}</p></li></ol><dl className={`space-y-1 border-t border-[var(--fleet-line)] pt-3 text-xs leading-relaxed ${muted}`}>{[["นัดรับ", job.scheduled_start_at], ["รับงาน", job.accepted_at], ["เริ่มงาน", job.actual_start_at], ["จบงาน", job.actual_end_at]].filter(([title, value]) => title === "นัดรับ" || value).map(([title, value]) => <div key={title}><dt className="inline font-semibold">{title}</dt> <dd className="inline">{formatJobTime(value)}</dd></div>)}</dl>{job.problem_note && <p className="rounded-xl bg-[var(--fleet-selected)] p-3 text-sm whitespace-pre-wrap break-words text-[var(--fleet-accent)]">ปัญหาที่แจ้ง: {job.problem_note}</p>}</section>
  </div>;
}

function JobMap({ entry, pending, onBack, onStart, onFinish, onConfirmFinish, onProblem, notice, menu }: { entry: DriverJobEntry; pending: boolean; onBack: () => void; onStart: () => void; onFinish: () => void; onConfirmFinish: () => void; onProblem: () => void; notice: ReactNode; menu: ReactNode }) {
  const { job, status } = entry;
  const [expanded, setExpanded] = useState(false);
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const request = useRef<AbortController | null>(null);
  const places = useMemo(() => jobPlaces(job), [job]);
  const actualRoute = job.route_snapshot ?? route;
  const step = stepIndex === null ? undefined : actualRoute?.steps[stepIndex];
  useEffect(() => () => request.current?.abort(), []);
  async function calculate() {
    if (!places.origin || !places.destination) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setRouteBusy(true); setRouteError("");
    try {
      const response = await fetch("/api/navigation/route", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ origin: { latitude: places.origin.latitude, longitude: places.origin.longitude }, destination: { latitude: places.destination.latitude, longitude: places.destination.longitude } }) });
      const result = await response.json() as ApiResponse<NavigationRoute>;
      if (!response.ok || !result.success) throw new Error();
      if (!controller.signal.aborted) { setRoute(result.data); setStepIndex(null); }
    } catch { if (!controller.signal.aborted) setRouteError("คำนวณเส้นทางไม่ได้ กรุณาลองใหม่อีกครั้ง"); }
    finally { if (!controller.signal.aborted) setRouteBusy(false); }
  }
  const canFinish = status === "in_progress";
  return <article aria-labelledby="driver-map-title" data-sheet-expanded={expanded} data-finish-prompt={canFinish && !expanded} className={`driver-full-map ${process.env.NODE_ENV === "development" ? "driver-full-map-dev" : ""}`}>
    {places.origin && places.destination ? <NavigationRouteMap fullScreen origin={places.origin} destination={places.destination} route={actualRoute ?? undefined} stepIndex={stepIndex} /> : <div className="absolute inset-0 grid place-content-center gap-3 bg-[var(--fleet-quiet)] px-6 pb-36 text-center"><Icon name="route" className="mx-auto size-12 text-[var(--fleet-accent)]" /><p className="font-bold">งานนี้ยังไม่มีพิกัดจุดรับ–ส่ง</p><p className={`max-w-sm text-sm ${muted}`}>ให้ผู้จัดการงานเลือกตำแหน่งบนแผนที่ก่อนรับงานครั้งถัดไป คุณยังจัดการสถานะงานนี้ได้</p></div>}
    <div className="driver-map-header pointer-events-none absolute inset-x-0 z-20 mx-auto flex max-w-xl items-center gap-2.5">
      <button type="button" aria-label="กลับไปใบงาน" onClick={onBack} className={`soft-panel pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full bg-[var(--fleet-highlight)] text-[var(--fleet-accent)] ${focus}`}><Icon name="arrow" className="size-5 rotate-180" /></button>
      <section className="soft-panel pointer-events-auto min-w-0 flex-1 rounded-full bg-[var(--fleet-highlight)] px-5 py-3"><h1 id="driver-map-title" data-driver-heading tabIndex={-1} className="truncate text-sm font-bold">{step?.instruction ?? "แผนที่งานขนส่ง"}</h1><p className={`mt-1 truncate text-xs ${muted}`}>{actualRoute ? `${(actualRoute.distance_meters / 1000).toFixed(1)} กม. · ประมาณ ${Math.ceil(actualRoute.duration_seconds / 60)} นาที` : job.delivery_address} · ยังไม่ใช้ GPS</p></section>
    </div>
    {canFinish && !expanded && <div className="driver-map-finish-prompt pointer-events-none absolute inset-x-0 z-20 mx-auto flex max-w-xl justify-center px-4"><div className="w-full max-w-xs"><DriverFinishSlider disabled={pending} onSlide={onFinish} onConfirm={onConfirmFinish} /></div></div>}
    <DriverMapSheet expanded={expanded} onExpandedChange={setExpanded} summary={`${job.job_code} · ${status === "problem" ? "แจ้งปัญหาอยู่" : "ดูใบงานและจัดการงาน"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="min-w-0 text-lg font-bold break-words">{job.job_name ?? job.job_code}</h2><Status status={status} /></div>
      {notice}
      {canFinish ? <DriverFinishSlider disabled={pending} onSlide={onFinish} onConfirm={onConfirmFinish} /> : <button type="button" disabled={pending} onClick={onStart} className={`${primaryButton} w-full`}>{status === "problem" ? "กลับมาทำงานต่อ" : "เริ่มงาน"}</button>}
      {status !== "problem" && <button type="button" disabled={pending} onClick={onProblem} className={`${secondary} w-full text-[var(--fleet-accent)]`}>แจ้งปัญหา</button>}
      <p className={`text-xs leading-relaxed ${muted}`}>เส้นทางตามถนนสำหรับดูประกอบการเดินทาง ไม่มีการติดตามตำแหน่งหรือเปลี่ยนขั้นตอนอัตโนมัติ กรุณาจบงานเมื่อส่งสินค้าเรียบร้อยแล้ว</p>
      {!actualRoute && places.origin && places.destination && <button type="button" disabled={routeBusy} onClick={() => void calculate()} className={`${secondary} w-full`}>{routeBusy ? "กำลังคำนวณ…" : "คำนวณเส้นทางถนน"}</button>}
      {routeError && <p role="alert" className="text-sm text-[var(--fleet-accent)]">{routeError}</p>}
      {actualRoute && <section aria-label="ขั้นตอนเส้นทาง" className="space-y-2"><div className="flex items-center justify-between gap-2"><button type="button" disabled={stepIndex === null || stepIndex === 0} onClick={() => setStepIndex((index) => Math.max(0, (index ?? 0) - 1))} className={secondary}>ก่อนหน้า</button><span className={`text-xs ${muted}`}>{stepIndex === null ? "ภาพรวม" : stepIndex + 1} / {actualRoute.steps.length}</span><button type="button" disabled={!actualRoute.steps.length || (stepIndex !== null && stepIndex >= actualRoute.steps.length - 1)} onClick={() => setStepIndex((index) => index === null ? 0 : index + 1)} className={secondary}>ถัดไป</button></div><p className="text-sm leading-relaxed">{step?.instruction ?? "เลือกถัดไปเพื่อดูแต่ละช่วงของเส้นทาง"}</p><button type="button" onClick={() => setStepIndex(null)} className={secondary}>ดูเส้นทางทั้งหมด</button></section>}
      <JobInformation job={job} />{menu}
    </DriverMapSheet>
  </article>;
}

function DriverMenu({ view, onPick, unread, floating = false }: { view: View; onPick: (view: View) => void; unread: number; floating?: boolean }) {
  return (
    <nav aria-label="เมนู Driver" className={floating ? "pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" : undefined}>
      <div className={`mx-auto grid w-full grid-cols-5 gap-1 rounded-[24px] border border-[var(--fleet-line)] bg-[var(--fleet-surface)] p-1.5 ${floating ? "soft-panel pointer-events-auto max-w-sm" : ""}`}>
        {views.map(({ id, icon, label }) => (
          <button key={id} type="button" aria-current={view === id ? "page" : undefined} onClick={() => onPick(id)} className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[17px] px-0.5 py-1.5 text-xs font-bold ${focus} ${view === id ? "soft-inset bg-[var(--fleet-selected)] text-[var(--fleet-accent)]" : `hover:bg-[var(--fleet-quiet)] ${muted}`}`}>
            <span className="relative">
              <Icon name={icon} className="size-5" />
              {id === "messages" && unread > 0 && <span className="absolute -end-4 -top-1.5"><UnreadCount count={unread} /></span>}
            </span>
            {label}
          </button>
        ))}
        <form action={logout} className="min-w-0"><DriverLogoutButton /></form>
      </div>
    </nav>
  );
}
function DriverLogoutButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending} className={`flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-[17px] px-1 py-1.5 text-[11px] font-bold whitespace-nowrap text-[var(--fleet-accent)] hover:bg-[var(--fleet-selected)] disabled:opacity-60 sm:text-xs ${focus}`}><Icon name="logout" className="size-5" /><span>{pending ? "กำลังออก…" : "ออกจากระบบ"}</span></button>;
}
