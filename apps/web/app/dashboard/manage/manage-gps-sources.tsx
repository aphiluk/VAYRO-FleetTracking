"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import type { GpsDevice, GpsSourceType, VehicleRecord } from "../../../../../packages/shared-types";
import { useDashboardUser } from "../_components/admin-shell";
import { useFleetVehicles, vehicleStatusLabels } from "../_components/fleet-vehicles";
import { gpsSourceError, useGpsSources } from "./use-gps-sources";

const labels: Record<GpsSourceType, string> = {
  driver_mobile_app: "มือถือคนขับ (Android APK)",
  gps_device: "อุปกรณ์ GPS",
  provider_api: "API ผู้ให้บริการ",
};
const muted = "text-[color:var(--fleet-muted)]";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
const button = `inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-3.5 text-sm font-semibold disabled:cursor-default disabled:opacity-50 ${focus}`;
const secondary = `${button} border border-[var(--fleet-line)] hover:bg-[var(--fleet-quiet)]`;
const field = `h-11 w-full min-w-0 rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] px-3 text-base font-normal sm:text-sm ${focus}`;
const panel = "soft-card min-w-0 border border-[var(--fleet-line)] bg-[var(--fleet-surface)]";
const timeFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Bangkok" });
type Save = ReturnType<typeof useGpsSources>["save"];

function lastReceived(device: GpsDevice) {
  return device.last_received_at ? timeFormat.format(new Date(device.last_received_at)) : "ยังไม่เคยรับพิกัด";
}

function isDisabled(device: GpsDevice) {
  return device.connection_config?.disabled === true;
}

function ConnectionStatus({ device, stale }: { device: GpsDevice; stale: boolean }) {
  const status = stale ? "สถานะจากรอบก่อน"
    : isDisabled(device) ? "ปิดรับพิกัด"
    : device.connection_status === "error" ? "ขัดข้อง"
    : device.connection_status === "connected" ? "รับข้อมูลล่าสุด"
    : device.last_received_at ? "ไม่มีข้อมูลล่าสุด" : "รอพิกัดแรก";
  const connected = !stale && !isDisabled(device) && device.connection_status === "connected";
  const tone = connected ? "bg-[#e3f2e9] text-[#20593f]" : `bg-[var(--fleet-quiet)] ${muted}`;
  return <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
    <span aria-hidden="true" className={`size-1.5 rounded-full ${connected ? "bg-[#328457]" : "bg-current opacity-55"}`} />
    {status}
  </span>;
}

function GpsSourceEditor({ device, vehicles, canSave, save, onSaved, onBusy }: {
  device?: GpsDevice;
  vehicles: VehicleRecord[];
  canSave: boolean;
  save: Save;
  onSaved: (value: GpsDevice, message: string) => void;
  onBusy: (value: boolean) => void;
}) {
  const formId = useId();
  const [initialDevice] = useState(device);
  const [source, setSource] = useState<GpsSourceType>(device?.source_type ?? "driver_mobile_app");
  const [vehicleId, setVehicleId] = useState(device?.vehicle_id ?? "");
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean }>();
  const busy = useRef(false);
  const vehicle = vehicles.find((row) => row.vehicle_id === vehicleId);

  async function write(path: string, method: "POST" | "PUT" | "PATCH", payload: object, message: string) {
    if (busy.current || !canSave) return;
    busy.current = true;
    setWorking(true);
    onBusy(true);
    setFeedback(undefined);
    try {
      const result = await save(path, method, payload);
      if (result.device) onSaved(result.device, message);
      else setFeedback({ text: gpsSourceError(result.error, true), error: true });
    } finally {
      busy.current = false;
      setWorking(false);
      onBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("device_code") ?? "").trim();
    const provider = String(form.get("provider_name") ?? "").trim() || null;
    if (!code || !vehicle) {
      setFeedback({ text: "เลือกรถและกรอกรหัสอุปกรณ์ก่อนบันทึก", error: true });
      return;
    }
    const payload = { vehicle_id: vehicleId, device_code: code, source_type: source, ...(source !== "driver_mobile_app" ? { provider_name: provider } : {}) };
    if (!initialDevice) {
      void write("", "POST", payload, "เพิ่มแหล่ง GPS แล้ว");
      return;
    }
    const changes = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => initialDevice[key as keyof typeof payload] !== value),
    );
    if (!Object.keys(changes).length) {
      setFeedback({ text: "ยังไม่มีรายการเปลี่ยนแปลง", error: false });
      return;
    }
    void write(`/${initialDevice.gps_device_id}`, "PUT", changes, "บันทึกแหล่ง GPS แล้ว");
  }

  async function copyCode() {
    if (!device) return;
    try {
      await navigator.clipboard.writeText(device.device_code);
      setFeedback({ text: "คัดลอกรหัสอุปกรณ์แล้ว", error: false });
    } catch {
      setFeedback({ text: "คัดลอกอัตโนมัติไม่ได้ เลือกข้อความในช่องรหัสอุปกรณ์ได้เลย", error: true });
    }
  }

  function setEnabled(enabled: boolean) {
    if (!device) return;
    setConfirmDisable(false);
    void write(`/${device.gps_device_id}/status`, "PATCH", { enabled }, enabled ? "เปิดรับพิกัดแล้ว" : "ปิดรับพิกัดแล้ว");
  }

  return (
    <section aria-labelledby={formId} className={`${panel} p-4 sm:p-5`}>
      <h3 id={formId} tabIndex={-1} data-gps-editor-heading className="text-base font-bold outline-none">
        {device ? "แก้ไขแหล่ง GPS" : "เพิ่มแหล่ง GPS"}
      </h3>
      {device && <p className={`mt-1 text-xs ${muted}`}>รับล่าสุด · {lastReceived(device)}</p>}
      <form onSubmit={submit} className="mt-4 space-y-4">
        <fieldset disabled={!canSave || working} className="min-w-0 space-y-3.5 disabled:opacity-65">
          <label className="grid gap-1.5 text-sm font-semibold">
            รถ
            <select required name="vehicle_id" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} className={field}>
              <option value="">เลือกรถใน Workspace</option>
              {vehicleId && !vehicle && <option value={vehicleId}>ไม่พบรถ #{vehicleId}</option>}
              {vehicles.map((row) => <option key={row.vehicle_id} value={row.vehicle_id}>
                {row.license_plate} · {row.vehicle_code}{row.vehicle_status !== "active" ? ` (${vehicleStatusLabels[row.vehicle_status]})` : ""}
              </option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            ประเภทแหล่ง GPS
            <select name="source_type" value={source} onChange={(event) => setSource(event.target.value as GpsSourceType)} className={field}>
              {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="grid gap-1.5">
            <label htmlFor={`${formId}-device-code`} className="text-sm font-semibold">รหัสอุปกรณ์ <span className={`text-xs font-normal ${muted}`}>device_code</span></label>
            <div className="flex gap-2">
              <input id={`${formId}-device-code`} className={`${field} font-mono`} name="device_code" required maxLength={100} spellCheck={false} autoComplete="off" placeholder="PHONE-TEST-01" defaultValue={device?.device_code ?? ""} />
              {device && <button type="button" onClick={copyCode} aria-label="คัดลอกรหัสอุปกรณ์ที่บันทึกไว้" className={`${secondary} shrink-0 px-2.5`}>คัดลอก</button>}
            </div>
          </div>
          {source !== "driver_mobile_app" && <label className="grid gap-1.5 text-sm font-semibold">
            <span>ชื่อผู้ให้บริการ <span className={`text-xs font-normal ${muted}`}>ไม่บังคับ</span></span>
            <input name="provider_name" maxLength={120} defaultValue={initialDevice?.provider_name ?? ""} className={field} />
          </label>}
          <p className={`text-xs leading-relaxed ${muted}`}>
            {source === "driver_mobile_app"
              ? vehicle && !vehicle.current_driver_id
                ? "รถคันนี้ยังไม่มีคนขับประจำรถ ตั้งค่าคนขับในทะเบียนรถก่อนให้ APK เริ่มส่งพิกัด"
                : "ใช้รหัสนี้ใน APK คนขับส่งพิกัดได้เมื่อมีงานกำลังทำกับรถคันนี้"
              : "ลงทะเบียนแหล่ง GPS ไว้กับรถ การส่งพิกัดต้องตั้งค่าที่อุปกรณ์หรือตัวเชื่อมต่อของผู้ให้บริการด้วย"}
          </p>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={!canSave || working || !vehicle} className={`${button} bg-[var(--fleet-signal)] text-[color:var(--fleet-on-signal)] hover:bg-[var(--fleet-signal-hover)]`}>
            {working ? "กำลังบันทึก…" : device ? "บันทึกการแก้ไข" : "ลงทะเบียนแหล่ง GPS"}
          </button>
          {device && !confirmDisable && <button type="button" disabled={working || !canSave} className={secondary} onClick={() => isDisabled(device) ? setEnabled(true) : setConfirmDisable(true)}>
            {isDisabled(device) ? "เปิดรับพิกัด" : "ปิดรับพิกัด"}
          </button>}
        </div>
        {confirmDisable && <div className="rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] p-3 text-sm">
          <p className="font-semibold">ปิดรับพิกัดจากแหล่งนี้?</p>
          <p className={`mt-0.5 text-xs ${muted}`}>ข้อมูลย้อนหลังยังเปิดดูได้</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={!canSave || working} className={`${secondary} text-[color:var(--fleet-accent)]`} onClick={() => setEnabled(false)}>ยืนยันปิดรับพิกัด</button>
            <button type="button" className={secondary} onClick={() => setConfirmDisable(false)}>ยกเลิก</button>
          </div>
        </div>}
        {feedback && <p role={feedback.error ? "alert" : "status"} className={`text-sm ${feedback.error ? "text-[color:var(--fleet-accent)]" : muted}`}>{feedback.text}</p>}
      </form>
    </section>
  );
}

export default function ManageGpsSources({ active }: { active: boolean }) {
  const user = useDashboardUser();
  const fleet = useFleetVehicles();
  const canManage = user?.role === "company_admin";
  const { rows, error, refresh, save } = useGpsSources(active && canManage, user?.company_id ?? null);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const editor = useRef<HTMLDivElement>(null);
  const vehicleById = new Map(fleet.vehicles.map((vehicle) => [vehicle.vehicle_id, vehicle]));
  const selected = rows?.find((row) => row.gps_device_id === selection);
  const normalized = query.trim().toLocaleLowerCase("th-TH");
  const matches = rows?.filter((device) => {
    const vehicle = vehicleById.get(device.vehicle_id);
    return [device.device_code, device.provider_name, vehicle?.license_plate, vehicle?.vehicle_code]
      .some((value) => value?.toLocaleLowerCase("th-TH").includes(normalized));
  });

  function choose(id: string | null) {
    setSelection(id);
    setNotice("");
    requestAnimationFrame(() => editor.current?.querySelector<HTMLElement>("[data-gps-editor-heading]")?.focus());
  }

  if (!canManage) return <p className={`p-5 text-sm ${muted}`}>เมนูนี้สำหรับผู้ดูแลบริษัท</p>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">จัดการแหล่ง GPS</h2>
          <p className={`mt-0.5 text-xs ${muted}`}>ผูกอุปกรณ์กับรถและตรวจเวลารับพิกัดล่าสุด</p>
        </div>
        <button type="button" onClick={refresh} disabled={working} className={secondary}>โหลดรายการใหม่</button>
      </header>
      {notice && <p role="status" className="mb-3 rounded-xl bg-[#e3f2e9] px-3 py-2 text-sm text-[#20593f]">{notice}</p>}
      {error && <p role="alert" className="mb-3 rounded-xl bg-[var(--fleet-selected)] px-3 py-2 text-sm text-[color:var(--fleet-accent)]">
        {gpsSourceError(error)}{rows ? " · แสดงรายการจากรอบก่อน" : ""}
      </p>}
      <div className="grid items-start gap-4 min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
        <section aria-label="รายการแหล่ง GPS" className={`${panel} p-3.5 sm:p-4`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">รายการแหล่ง GPS {rows && <span className={`ms-1 tabular-nums ${muted}`}>{rows.length}</span>}</h3>
            <button type="button" onClick={() => choose(null)} disabled={working} className={secondary}>เพิ่มใหม่</button>
          </div>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="ค้นหาแหล่ง GPS" placeholder="ค้นหารหัสหรือทะเบียนรถ" className={`mb-2 ${field}`} />
          {!rows && !error && <p role="status" className={`py-4 text-center text-sm ${muted}`}>กำลังโหลดรายการ…</p>}
          {rows && <ul className="max-h-64 space-y-1 overflow-auto overscroll-contain min-[1000px]:max-h-[27rem]">
            {matches?.map((device) => {
              const vehicle = vehicleById.get(device.vehicle_id);
              const plate = vehicle?.license_plate ?? `รถ #${device.vehicle_id}`;
              const pressed = selection === device.gps_device_id;
              return <li key={device.gps_device_id}>
                <button type="button" disabled={working} aria-pressed={pressed} onClick={() => choose(device.gps_device_id)}
                  className={`grid w-full min-w-0 gap-1 rounded-xl border px-3 py-2.5 text-start ${focus} ${pressed ? "border-[var(--fleet-line)] bg-[var(--fleet-selected)]" : "border-transparent hover:bg-[var(--fleet-quiet)]"}`}>
                  <span className="flex flex-wrap items-center justify-between gap-1">
                    <span className="min-w-0 font-mono text-sm font-bold wrap-anywhere">{device.device_code}</span>
                    <ConnectionStatus device={device} stale={Boolean(error)} />
                  </span>
                  <span className={`text-xs wrap-anywhere ${muted}`}>{plate} · {labels[device.source_type]}</span>
                  <span className={`text-[11px] ${muted}`}>{device.last_received_at ? `รับล่าสุด · ${lastReceived(device)}` : lastReceived(device)}</span>
                </button>
              </li>;
            })}
            {!matches?.length && <li className={`py-5 text-center text-sm ${muted}`}>{rows.length ? "ไม่พบแหล่ง GPS ที่ตรงกับคำค้น" : "ยังไม่มีแหล่ง GPS ใน Workspace"}</li>}
          </ul>}
        </section>

        <div ref={editor} className="min-w-0">
          {fleet.error && <p role="alert" className="mb-2 text-sm text-[color:var(--fleet-accent)]">โหลดทะเบียนรถไม่สำเร็จ กรุณาโหลดข้อมูลบริษัทใหม่</p>}
          {!fleet.loading && !fleet.vehicles.length && !fleet.error && <p className={`mb-2 text-sm ${muted}`}>เพิ่มรถในเมนูเพิ่มรถก่อนลงทะเบียนแหล่ง GPS</p>}
          {selection && !selected
            ? <p role="status" className={`${panel} p-4 text-sm ${muted}`}>ยังเปิดรายละเอียดของแหล่ง GPS นี้ไม่ได้</p>
            : <GpsSourceEditor
                key={`${selection ?? "new"}:${editorVersion}`}
                device={selected}
                vehicles={fleet.vehicles}
                canSave={rows !== null && !error && !fleet.error}
                save={save}
                onBusy={setWorking}
                onSaved={(value, message) => {
                  if (!selection) setQuery("");
                  setSelection(value.gps_device_id);
                  setEditorVersion((version) => version + 1);
                  setNotice(message);
                }}
              />}
        </div>
      </div>
    </div>
  );
}
