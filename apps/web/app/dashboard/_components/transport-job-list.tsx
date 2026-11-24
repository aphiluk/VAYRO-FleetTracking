"use client";

import { useState } from "react";
import type { TransportJobRecord } from "../../../../../packages/shared-types";
import { useTransportJobs, transportErrorMessage } from "@/lib/transport-client";
import { transportStates, formatJobTime, jobNavigation } from "@/lib/transport-format";
import NavigationRouteView from "./navigation-route-view";

const muted = "text-[color:var(--fleet-muted)]";
const action = "min-h-11 cursor-pointer rounded-lg px-2.5 text-xs font-semibold text-[color:var(--fleet-accent)] hover:bg-[var(--fleet-selected)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";

export default function TransportJobList({ onEdit }: { onEdit?: (job: TransportJobRecord) => void }) {
  const { jobs, loading, error, pending, refresh, actOnJob } = useTransportJobs();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const shown = jobs.filter((job) => `${job.job_code} ${job.job_name} ${job.vehicle?.license_plate} ${job.driver?.full_name}`.toLowerCase().includes(query.toLowerCase()));
  async function cancel(id: string) {
    const result = await actOnJob(id, "cancel");
    setMessage(result.ok ? "ยกเลิกงานแล้ว" : transportErrorMessage(result.code));
    if (result.ok) setConfirming(null);
  }
  return <div className="space-y-3">
    <div className="flex gap-2">
      <input aria-label="ค้นหางาน" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหารหัสงาน รถ หรือคนขับ" className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--fleet-line)] px-3 text-sm" />
      <button type="button" disabled={loading || pending} onClick={refresh} className={action}>{loading ? "กำลังโหลด…" : "โหลดใหม่"}</button>
    </div>
    {error && <p role="alert" className="text-sm text-[var(--fleet-accent)]">{transportErrorMessage(error)}</p>}
    {message && <p role="status" className={`text-sm ${muted}`}>{message}</p>}
    {!shown.length && <p role="status" className={`rounded-xl border border-dashed border-[var(--fleet-line)] p-5 text-center text-sm ${muted}`}>{loading ? "กำลังโหลดงาน…" : error ? "ยังโหลดงานไม่ได้ กดโหลดใหม่เพื่อลองอีกครั้ง" : query ? "ไม่พบงานที่ค้นหา" : "ยังไม่มีงานขนส่ง"}</p>}
    <ul className="space-y-2.5">{shown.map((job) => {
      const nav = jobNavigation(job);
      const state = transportStates[job.job_status];
      return <li key={job.job_id} className="min-w-0 rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-highlight)] px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 break-words"><h3 className="text-sm leading-relaxed font-bold">{job.job_name ?? job.job_code}</h3><p className={`mt-0.5 font-mono text-xs ${muted}`}>{job.job_code}</p></div>
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${state.style}`}>{state.label}</span>
        </div>
        <dl className={`mt-2 grid gap-1 text-xs leading-relaxed wrap-anywhere ${muted}`}>
          {[["รับ", job.pickup_address], ["ส่ง", job.delivery_address], ["สินค้า", job.cargo_description ?? "ไม่ระบุ"], ["นัดรับ", formatJobTime(job.scheduled_start_at)], ["รถ", job.vehicle?.license_plate ?? "ยังไม่เลือก"], ["คนขับ", job.driver?.full_name ?? "ยังไม่เลือก"], ...(job.accepted_at ? [["รับงาน", formatJobTime(job.accepted_at)]] : []), ...(job.actual_start_at ? [["เริ่มงาน", formatJobTime(job.actual_start_at)]] : []), ...(job.actual_end_at ? [["จบงาน", formatJobTime(job.actual_end_at)]] : [])].map(([title, value]) => <div key={title}><dt className="inline font-semibold">{title}</dt> <dd className="inline whitespace-pre-wrap">{value}</dd></div>)}
        </dl>
        {job.problem_note && <p className="mt-2 rounded-xl bg-[var(--fleet-selected)] p-2 text-xs leading-relaxed whitespace-pre-wrap break-words text-[var(--fleet-accent)]">ปัญหาที่แจ้ง: {job.problem_note}</p>}
        {nav && <div className="mt-2 space-y-3"><button type="button" aria-expanded={routeId === job.job_id} onClick={() => setRouteId(routeId === job.job_id ? null : job.job_id)} className={action}>{routeId === job.job_id ? "ซ่อนเส้นทาง" : "ดูเส้นทางถนน"}</button>{routeId === job.job_id && <NavigationRouteView navigation={nav} />}</div>}
        {onEdit && <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-[var(--fleet-line)] pt-2">
          {["pending", "assigned"].includes(job.job_status) && <button type="button" disabled={pending} aria-label={`แก้ไขงาน ${job.job_code}`} onClick={() => onEdit(job)} className={action}>แก้ไข / มอบหมาย</button>}
          {!["completed", "cancelled"].includes(job.job_status) && (confirming === job.job_id ? <><span className={`text-xs ${muted}`}>ยืนยันยกเลิก {job.job_code}?</span><button type="button" disabled={pending} onClick={() => void cancel(job.job_id)} className={action}>ยืนยันยกเลิก</button><button type="button" onClick={() => setConfirming(null)} className={action}>เก็บงานไว้</button></> : <button type="button" disabled={pending} onClick={() => setConfirming(job.job_id)} className={action}>ยกเลิกงาน</button>)}
        </div>}
      </li>;
    })}</ul>
  </div>;
}
