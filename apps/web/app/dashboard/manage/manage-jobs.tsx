"use client";

import { useRef, useState, type FormEvent } from "react";
import type { NavigationPlace, TransportJobRecord } from "../../../../../packages/shared-types";
import { useTransportJobs, transportErrorMessage } from "@/lib/transport-client";
import { jobNavigation, jobPlaces, jobTimeInput, type JobNavigation } from "@/lib/transport-format";
import { useFleetVehicles } from "../_components/fleet-vehicles";
import TransportJobList from "../_components/transport-job-list";
import NavigationPlanner from "../_components/navigation-planner";

const panel = "soft-card border border-[var(--fleet-line)] bg-[var(--fleet-surface)]";
const label = "grid min-w-0 gap-1.5 text-sm font-semibold";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
const field = `min-h-11 w-full min-w-0 rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] px-3 py-2 text-base sm:text-sm ${focus}`;
const muted = "text-[color:var(--fleet-muted)]";

export default function ManageJobs() {
  const { jobs, saveJob, pending } = useTransportJobs();
  const { vehicles, drivers: companyDrivers } = useFleetVehicles();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [navigation, setNavigation] = useState<JobNavigation>();
  const [points, setPoints] = useState<{ origin?: NavigationPlace; destination?: NavigationPlace }>({});
  const [resetVersion, setResetVersion] = useState(0);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const editor = useRef<HTMLFormElement>(null);
  const editing = jobs.find((job) => job.job_id === editingId);
  const editable = !editing || ["pending", "assigned"].includes(editing.job_status);
  const availableVehicles = vehicles.filter((vehicle) => vehicle.vehicle_status === "active");
  const drivers = companyDrivers.filter((driver) => driver.account_status === "active");

  function editJob(job: TransportJobRecord) {
    setEditingId(job.job_id); setNavigation(jobNavigation(job)); setPoints(jobPlaces(job)); setFeedback(null);
    window.requestAnimationFrame(() => editor.current?.querySelector<HTMLInputElement>("input[name='code']")?.focus());
  }
  function reset() { setEditingId(null); setNavigation(undefined); setPoints({}); setResetVersion((v) => v + 1); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !editable) return;
    const data = new FormData(event.currentTarget);
    const read = (name: string) => String(data.get(name) ?? "").trim();
    const scheduled = read("scheduled-at");
    if (scheduled && !Number.isFinite(Date.parse(`${scheduled}+07:00`))) { setFeedback({ text: "กรุณาตรวจสอบเวลานัดรับ", error: true }); return; }
    const result = await saveJob({
      job_code: read("code"), job_name: read("name") || null,
      pickup_address: read("pickup"), delivery_address: read("delivery"),
      pickup_latitude: points.origin?.latitude ?? null, pickup_longitude: points.origin?.longitude ?? null,
      delivery_latitude: points.destination?.latitude ?? null, delivery_longitude: points.destination?.longitude ?? null,
      route_snapshot: navigation?.route ?? null, cargo_description: read("cargo") || null,
      scheduled_start_at: scheduled ? new Date(`${scheduled}+07:00`).toISOString() : null,
      vehicle_id: read("vehicle") || null, driver_id: read("driver") || null,
    }, editing?.job_id);
    if (!result.ok) { setFeedback({ text: transportErrorMessage(result.code), error: true }); return; }
    reset();
    setFeedback({ text: `${editing ? "บันทึก" : "สร้าง"}งาน ${result.data.job_code} แล้ว${result.data.job_status === "assigned" ? " · ส่งเข้ารายการงานของ Driver แล้ว" : " · รอมอบหมายรถและคนขับ"}` });
  }

  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
    <header className="mb-4 border-b border-[var(--fleet-line)] pb-4">
      <h2 className="text-lg font-bold sm:text-xl">จัดการงานขนส่ง</h2>
      <p className={`mt-1 text-sm leading-relaxed ${muted}`}>สร้างงาน ระบุจุดรับ–ส่ง และมอบหมายรถกับคนขับในบริษัท</p>
    </header>
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <form key={`${editingId ?? "new"}:${resetVersion}`} ref={editor} onSubmit={(event) => void submit(event)} className={`${panel} min-w-0 space-y-3 p-3.5 sm:p-4`}>
        <h3 className="border-b border-[var(--fleet-line)] pb-2 text-sm font-bold">{editing ? "แก้ไข / มอบหมายงาน" : "สร้างงาน"}</h3>
        <fieldset disabled={pending || !editable} className="min-w-0 space-y-3 disabled:opacity-60">
          <label className={label}>รหัสงาน<input name="code" required maxLength={50} defaultValue={editing?.job_code} placeholder="เช่น JOB-2026-001" className={field} /></label>
          <label className={label}>ชื่องาน<input name="name" maxLength={150} defaultValue={editing?.job_name ?? ""} placeholder="เช่น ส่งสินค้าเข้าคลัง" className={field} /></label>
          <NavigationPlanner initial={editing ? jobNavigation(editing) : undefined} points={editing ? jobPlaces(editing) : undefined} pickup={editing?.pickup_address} delivery={editing?.delivery_address} onChange={setNavigation} onPointsChange={setPoints} />
          <label className={label}>สิ่งที่ส่ง<textarea name="cargo" maxLength={2000} rows={2} defaultValue={editing?.cargo_description ?? ""} placeholder="เช่น น้ำดื่ม 12 ลัง" className={`${field} resize-y`} /></label>
          <label className={label}>เวลานัดรับ (เวลาไทย)<input name="scheduled-at" type="datetime-local" defaultValue={jobTimeInput(editing?.scheduled_start_at ?? null)} className={field} /></label>
          <div className="grid min-w-0 gap-3 min-[1100px]:grid-cols-2">
            <label className={label}>รถ<select name="vehicle" defaultValue={editing?.vehicle_id ?? ""} className={field}>
              <option value="">ยังไม่เลือกรถ</option>
              {editing?.vehicle_id && !availableVehicles.some((v) => v.vehicle_id === editing.vehicle_id) && <option value={editing.vehicle_id}>รถเดิม (ไม่พร้อมใช้งาน) · กรุณาเปลี่ยน</option>}
              {availableVehicles.map((v) => <option key={v.vehicle_id} value={v.vehicle_id}>{v.license_plate} · {v.vehicle_code}</option>)}
            </select></label>
            <label className={label}>คนขับ<select name="driver" defaultValue={editing?.driver_id ?? ""} className={field}>
              <option value="">ยังไม่เลือกคนขับ</option>
              {editing?.driver_id && !drivers.some((d) => d.user_id === editing.driver_id) && <option value={editing.driver_id}>คนขับเดิม (ไม่พร้อมใช้งาน) · กรุณาเปลี่ยน</option>}
              {drivers.map((d) => <option key={d.user_id} value={d.user_id}>{d.full_name} · {d.email}</option>)}
            </select></label>
          </div>
          <p className={`text-xs ${muted}`}>เลือกรถและคนขับครบเพื่อส่งงานให้ Driver หรือบันทึกไว้รอมอบหมายได้</p>
          <button type="submit" className={`min-h-11 w-full cursor-pointer rounded-xl bg-[var(--fleet-signal)] px-3 text-sm font-bold text-[color:var(--fleet-on-signal)] ${focus}`}>{pending ? "กำลังบันทึก…" : editing ? "บันทึกงานและการมอบหมาย" : "สร้างงาน"}</button>
        </fieldset>
        {!editable && <p role="status" className={`text-sm ${muted}`}>Driver รับงานนี้แล้ว จึงแก้ไขรายละเอียดไม่ได้</p>}
        {feedback && <p role={feedback.error ? "alert" : "status"} className={`text-sm ${feedback.error ? "text-[color:var(--fleet-accent)]" : muted}`}>{feedback.text}</p>}
        {editing && <button type="button" disabled={pending} onClick={() => { reset(); setFeedback(null); }} className={`min-h-11 rounded-xl px-3 text-sm font-semibold hover:bg-[var(--fleet-quiet)] ${focus}`}>กลับไปสร้างงานใหม่</button>}
      </form>
      <section aria-labelledby="manage-jobs-title" className={`${panel} min-w-0 p-3.5 sm:p-4`}>
        <h3 id="manage-jobs-title" className="mb-3 text-sm font-bold">รายการงาน · {jobs.length} งาน</h3>
        <TransportJobList onEdit={editJob} />
      </section>
    </div>
  </div>;
}
