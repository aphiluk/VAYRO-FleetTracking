"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CreateVehicleRequest, UpdateVehicleRequest, VehicleRecord, VehicleStatus } from "../../../../../packages/shared-types";
import { fleetErrorMessage, useFleetVehicles, vehicleStatusLabels } from "./fleet-vehicles";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
const field = `min-h-11 w-full min-w-0 rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] px-3 py-2 text-base sm:text-sm ${focus}`;
const secondary = `min-h-11 cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold hover:bg-[var(--fleet-quiet)] disabled:opacity-50 ${focus}`;
const muted = "text-[color:var(--fleet-muted)]";

export default function VehicleForm({ vehicle, onSaved, onCancel }: { vehicle?: VehicleRecord; onSaved: (vehicle: VehicleRecord) => void; onCancel?: () => void }) {
  const { types, drivers, loading, error, canManage, refresh, saveVehicle, createType } = useFleetVehicles();
  const [typeId, setTypeId] = useState(vehicle?.vehicle_type_id ?? "");
  const [showType, setShowType] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [busy, setBusy] = useState(false);
  const [typeBusy, setTypeBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [typeMessage, setTypeMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { if (!loading) heading.current?.focus({ preventScroll: true }); }, [loading, vehicle?.vehicle_id]);

  async function addType() {
    const name = typeName.trim();
    if (!name || name.length > 80 || typeBusy) return;
    setTypeBusy(true);
    setTypeMessage("");
    const result = await createType(name);
    setTypeBusy(false);
    if (!result.ok) { setTypeMessage(fleetErrorMessage(result.code)); return; }
    setTypeId(result.data.vehicle_type_id);
    setTypeName("");
    setShowType(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || typeBusy) return;
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const status = text("vehicle_status");
    if (!text("vehicle_code") || !text("license_plate") || !Object.hasOwn(vehicleStatusLabels, status)) {
      setMessage("กรุณากรอกรหัสรถ ทะเบียน และสถานะให้ครบ");
      return;
    }
    const draft: CreateVehicleRequest = {
      vehicle_code: text("vehicle_code"), license_plate: text("license_plate"), vehicle_status: status as VehicleStatus,
      vehicle_type_id: typeId || null, current_driver_id: text("current_driver_id") || null,
    };
    let input: CreateVehicleRequest | UpdateVehicleRequest = draft;
    if (vehicle) {
      const changes: UpdateVehicleRequest = {};
      if (draft.vehicle_code !== vehicle.vehicle_code) changes.vehicle_code = draft.vehicle_code;
      if (draft.license_plate !== vehicle.license_plate) changes.license_plate = draft.license_plate;
      if (draft.vehicle_status !== vehicle.vehicle_status) changes.vehicle_status = draft.vehicle_status;
      if (draft.vehicle_type_id !== vehicle.vehicle_type_id) changes.vehicle_type_id = draft.vehicle_type_id;
      if (draft.current_driver_id !== vehicle.current_driver_id) changes.current_driver_id = draft.current_driver_id;
      if (!Object.keys(changes).length) { onSaved(vehicle); return; }
      input = changes;
    }
    setBusy(true);
    setMessage("");
    const result = await saveVehicle(input, vehicle?.vehicle_id);
    setBusy(false);
    if (!result.ok) { setMessage(fleetErrorMessage(result.code)); return; }
    onSaved(result.data);
  }

  if (!canManage) return <p className="p-5">บัญชีนี้ไม่มีสิทธิ์เพิ่มหรือแก้ไขรถ</p>;
  if (loading) return <p role="status" className={`p-5 ${muted}`}>กำลังโหลดข้อมูลรถและคนขับ…</p>;
  if (error) return <div className="space-y-3 p-5"><p role="alert">{fleetErrorMessage(error)}</p><button type="button" onClick={refresh} className={secondary}>โหลดรายการใหม่</button></div>;

  const availableDrivers = drivers.filter((driver) => driver.account_status === "active" || driver.user_id === vehicle?.current_driver_id);
  const missingDriver = vehicle?.current_driver_id && !availableDrivers.some((driver) => driver.user_id === vehicle.current_driver_id);
  const availableTypes = types.filter((type) => type.is_active || type.vehicle_type_id === vehicle?.vehicle_type_id);

  return (
    <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col" aria-busy={busy || typeBusy}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
        <header className="mb-5 border-b border-[var(--fleet-line)] pb-4">
          <h2 ref={heading} tabIndex={-1} className="text-lg font-bold outline-none">{vehicle ? "แก้ไขข้อมูลรถ" : "เพิ่มรถ"}</h2>
          <p className={`mt-1 text-sm ${muted}`}>ทะเบียน ประเภทรถ และคนขับประจำรถของบริษัท</p>
        </header>
        <fieldset disabled={busy || typeBusy} className="grid min-w-0 gap-4 sm:grid-cols-2 disabled:opacity-60">
          <label className="grid min-w-0 gap-1.5 text-sm font-semibold">รหัสรถ
            <input name="vehicle_code" required maxLength={50} defaultValue={vehicle?.vehicle_code} placeholder="เช่น TRK-009" className={field} />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-semibold">ทะเบียนรถ
            <input name="license_plate" required maxLength={30} defaultValue={vehicle?.license_plate} placeholder="เช่น 71-3042 กทม." className={field} />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-semibold">ประเภทรถ
            <select name="vehicle_type_id" value={typeId} onChange={(event) => setTypeId(event.target.value)} className={field}>
              <option value="">ยังไม่ระบุประเภท</option>
              {availableTypes.map((type) => <option key={type.vehicle_type_id} value={type.vehicle_type_id} disabled={!type.is_active}>{type.type_name}{!type.is_active ? " (หยุดใช้งาน)" : ""}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-semibold">คนขับประจำรถ
            <select name="current_driver_id" defaultValue={vehicle?.current_driver_id ?? ""} className={field}>
              <option value="">กำหนดภายหลัง</option>
              {availableDrivers.map((driver) => <option key={driver.user_id} value={driver.user_id}>{driver.full_name} ({driver.email}){driver.account_status !== "active" ? " · บัญชีหยุดใช้งาน" : ""}</option>)}
              {missingDriver && <option value={vehicle.current_driver_id!}>ผู้ใช้ #{vehicle.current_driver_id} (คนขับเดิม)</option>}
            </select>
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-semibold">สถานะการใช้งาน
            <select name="vehicle_status" defaultValue={vehicle?.vehicle_status ?? "active"} className={field}>
              {Object.entries(vehicleStatusLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
        </fieldset>
        <button type="button" disabled={busy || typeBusy} aria-expanded={showType} onClick={() => setShowType((value) => !value)} className={`mt-3 text-[color:var(--fleet-accent)] ${secondary}`}>{showType ? "ปิดการเพิ่มประเภท" : "เพิ่มประเภทรถ"}</button>
        {showType && <div className="mt-2 space-y-2 rounded-2xl border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] p-3">
          <label className="grid gap-1.5 text-sm font-semibold">ชื่อประเภทรถใหม่
            <input value={typeName} onChange={(event) => setTypeName(event.target.value)} maxLength={80} disabled={busy || typeBusy} placeholder="เช่น รถบรรทุก 6 ล้อ" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addType(); } }} className={field} />
          </label>
          <button type="button" disabled={busy || typeBusy || !typeName.trim()} onClick={() => void addType()} className={secondary}>{typeBusy ? "กำลังเพิ่มประเภท…" : "บันทึกประเภทรถ"}</button>
          {typeMessage && <p role="alert" className="text-sm text-[color:var(--fleet-accent)]">{typeMessage}</p>}
        </div>}
        {message && <p role="alert" className="mt-4 text-sm text-[color:var(--fleet-accent)]">{message}</p>}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--fleet-line)] bg-[var(--fleet-surface)] px-4 py-3 sm:px-6">
        {onCancel ? <button type="button" onClick={onCancel} disabled={busy || typeBusy} className={secondary}>กลับไปรายการรถ</button> : <Link href="/dashboard/vehicles" className={secondary}>ดูรายการรถ</Link>}
        <button type="submit" disabled={busy || typeBusy} className={`min-h-11 cursor-pointer rounded-xl bg-[var(--fleet-signal)] px-4 py-2 text-sm font-bold text-[color:var(--fleet-on-signal)] hover:bg-[var(--fleet-signal-hover)] disabled:cursor-wait disabled:opacity-60 ${focus}`}>{busy ? "กำลังบันทึก…" : vehicle ? "บันทึกการแก้ไข" : "บันทึกรถ"}</button>
      </footer>
    </form>
  );
}
