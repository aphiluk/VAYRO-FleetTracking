"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCompanySummary } from "@/lib/company-summary";
import { useDashboardUser } from "../_components/admin-shell";
import { transportStates } from "@/lib/transport-format";

const surface = "soft-card border border-[var(--fleet-line)] bg-[var(--fleet-surface)]";
const muted = "text-[color:var(--fleet-muted)]";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
const numberFormat = new Intl.NumberFormat("th-TH");
const updatedFormat = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" });

function errorMessage(code: string) {
  if (code === "UNAUTHORIZED") return "Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";
  if (code === "FORBIDDEN") return "บัญชีนี้ไม่มีสิทธิ์ดูภาพรวมของบริษัท";
  return "โหลดภาพรวมไม่สำเร็จ กรุณากดโหลดใหม่เพื่อลองอีกครั้ง";
}
function CountRows({ rows, unit }: { rows: { label: string; count: number; accent?: boolean }[]; unit: string }) {
  return <dl className="mt-2 divide-y divide-[var(--fleet-line)]">{rows.map((row) => <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-sm"><dt className={`min-w-0 break-words ${row.accent ? "font-semibold text-[var(--fleet-accent)]" : ""}`}>{row.label}</dt><dd className="shrink-0 font-semibold tabular-nums">{numberFormat.format(row.count)}<span className={`ml-1.5 text-xs font-normal ${muted}`}>{unit}</span></dd></div>)}</dl>;
}
function Total({ label, value, unit, detail, href, icon }: { label: string; value: number; unit: string; detail: string; href?: string; icon: ReactNode }) {
  return <div className={`${surface} min-w-0 p-2.5 sm:p-4`}><div className="flex items-center justify-between gap-2"><dt className={`min-h-10 text-xs leading-relaxed font-semibold sm:min-h-0 sm:text-sm ${muted}`}>{label}</dt><span aria-hidden="true" className="hidden text-[var(--fleet-accent)] sm:block"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icon}</svg></span></div><dd className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">{numberFormat.format(value)}<span className={`ml-1.5 text-xs font-normal ${muted}`}>{unit}</span></dd><dd className={`mt-2 hidden text-xs leading-relaxed sm:block ${muted}`}>{detail}</dd>{href && <dd className="mt-1"><Link href={href} className={`inline-flex min-h-10 items-center rounded-lg text-xs font-semibold text-[var(--fleet-accent)] hover:underline ${focus}`}>ดูรายการ{label === "รถทั้งหมด" ? "รถ" : "งาน"}</Link></dd>}</div>;
}

export default function CompanyOverview() {
  const user = useDashboardUser();
  const { data, loading, error, refresh } = useCompanySummary();
  const canView = user?.role === "company_admin";

  if (!canView) return <p className={`p-5 text-sm ${muted}`}>ภาพรวมนี้สำหรับผู้ดูแลบริษัท</p>;
  return <section aria-label="ภาพรวมจากฐานข้อมูลจริง" aria-busy={loading} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--fleet-page)] p-3 sm:p-4">
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="text-lg font-bold wrap-anywhere">{user.company_name ?? `Workspace ${user.company_id}`}</h2><p className={`mt-1 text-xs leading-relaxed ${muted}`}>ข้อมูลพนักงาน รถ และงานขนส่งของบริษัท</p>{data && <p className={`mt-1 text-xs ${muted}`}>อัปเดต <time dateTime={data.generated_at}>{updatedFormat.format(new Date(data.generated_at))}</time> · เวลาไทย</p>}</div>
      <button type="button" disabled={loading} onClick={refresh} className={`soft-control min-h-11 shrink-0 rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-surface)] px-3 text-xs font-semibold hover:bg-[var(--fleet-quiet)] disabled:cursor-wait disabled:opacity-60 ${focus}`}>{loading ? "กำลังโหลด…" : "โหลดใหม่"}</button>
    </header>
    {error && <div role="alert" className="mb-4 rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-selected)] p-3 text-sm leading-relaxed text-[var(--fleet-accent)]"><p>{errorMessage(error)}</p>{data && <p className="mt-1 text-xs">ตัวเลขด้านล่างเป็นข้อมูลที่โหลดสำเร็จครั้งล่าสุดตามเวลาอัปเดต</p>}</div>}
    {!data && <div role="status" className={`${surface} p-8 text-center text-sm ${muted}`}>{loading ? "กำลังนับข้อมูลจาก User, Vehicle และ Transport…" : "ยังแสดงจำนวนไม่ได้ กดโหลดใหม่เพื่อตรวจสอบข้อมูล"}</div>}
    {data && <>
      <dl className="grid min-w-0 grid-cols-3 gap-2 sm:gap-3">
        <Total label="พนักงานทั้งหมด" value={data.employees.total} unit="คน" detail={`ใช้งาน ${numberFormat.format(data.employees.by_status.active)} บัญชี · รวม Admin, Dispatch และ Driver`} icon={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>} />
        <Total label="รถทั้งหมด" value={data.vehicles.total} unit="คัน" detail={`ใช้งาน ${numberFormat.format(data.vehicles.by_status.active)} คัน · สถานะจากทะเบียนรถ`} href="/dashboard/vehicles" icon={<><path d="M3 17V6h12v11m0-8h3l3 4v4h-2m-9 0h5m-12 0h3" /><circle cx="8" cy="17" r="2" /><circle cx="18" cy="17" r="2" /></>} />
        <Total label="งานทั้งหมด" value={data.jobs.total} unit="งาน" detail={`กำลังทำ ${numberFormat.format(data.jobs.by_status.in_progress)} งาน · รวมงานจบและยกเลิก`} href="/dashboard/jobs" icon={<><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 18v-9m8-4.5-8 4.5-8-4.5" /></>} />
      </dl>
      <div className="mt-3 grid min-w-0 items-start gap-3 sm:grid-cols-2">
        <section aria-labelledby="employee-count-title" className={`${surface} min-w-0 p-4`}><h3 id="employee-count-title" className="text-sm font-bold">พนักงานตามบทบาท</h3><CountRows unit="คน" rows={[{ label: "ผู้ดูแลบริษัท", count: data.employees.by_role.company_admin }, { label: "Dispatch", count: data.employees.by_role.dispatcher }, { label: "Driver", count: data.employees.by_role.driver }]} /><p className={`mt-2 border-t border-[var(--fleet-line)] pt-3 text-xs leading-relaxed ${muted}`}>ใช้งาน {numberFormat.format(data.employees.by_status.active)} · หยุดใช้งาน {numberFormat.format(data.employees.by_status.inactive)} · ระงับ {numberFormat.format(data.employees.by_status.suspended)}</p></section>
        <section aria-labelledby="vehicle-count-title" className={`${surface} min-w-0 p-4`}><h3 id="vehicle-count-title" className="text-sm font-bold">สถานะการใช้งานรถ</h3><CountRows unit="คัน" rows={[{ label: "ใช้งาน", count: data.vehicles.by_status.active }, { label: "หยุดใช้งาน", count: data.vehicles.by_status.inactive }, { label: "ซ่อมบำรุง", count: data.vehicles.by_status.maintenance }]} /><p className={`mt-2 border-t border-[var(--fleet-line)] pt-3 text-xs leading-relaxed ${muted}`}>อ้างอิงสถานะที่บันทึกในทะเบียนรถ สถานะกำลังวิ่งและจอดต้องใช้ข้อมูล GPS เพิ่มเติม</p></section>
        <section aria-labelledby="job-count-title" className={`${surface} min-w-0 p-4`}><h3 id="job-count-title" className="text-sm font-bold">งานตามสถานะ</h3><CountRows unit="งาน" rows={(Object.keys(transportStates) as (keyof typeof transportStates)[]).map((key) => ({ label: transportStates[key].label, count: data.jobs.by_status[key], accent: key === "problem" && data.jobs.by_status.problem > 0 }))} /></section>
        <section aria-labelledby="type-count-title" className={`${surface} min-w-0 p-4`}><h3 id="type-count-title" className="text-sm font-bold">รถตามประเภท</h3>{data.vehicles.by_type.length ? <CountRows unit="คัน" rows={data.vehicles.by_type.map((type) => ({ label: type.type_name ?? (type.vehicle_type_id ? `ไม่พบประเภท · ${type.vehicle_type_id}` : "ยังไม่ระบุประเภท"), count: type.count }))} /> : <p className={`mt-3 text-sm ${muted}`}>ยังไม่มีรถในบริษัท</p>}</section>
      </div>
      <p className={`mt-4 text-xs leading-relaxed ${muted}`}>ยอดรวมทุกสถานะจากฐานข้อมูลของบริษัท · ตรวจข้อมูลใหม่ทุก 30 วินาทีขณะเปิดหน้านี้</p>
    </>}
  </section>;
}
