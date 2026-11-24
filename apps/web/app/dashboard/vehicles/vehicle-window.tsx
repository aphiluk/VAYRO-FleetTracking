"use client";

import Link from "next/link";
import { useState } from "react";
import DashboardWindow from "../_components/dashboard-window";
import { fleetErrorMessage, useFleetVehicles, vehicleStatusLabels } from "../_components/fleet-vehicles";
import VehicleForm from "../_components/vehicle-form";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
const control = `min-h-11 rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-surface)] px-3 text-sm ${focus}`;
const statusColor = { active: "bg-emerald-500", inactive: "bg-slate-400", maintenance: "bg-amber-500" } as const;

export default function VehicleWindow() {
  const { vehicles, types, drivers, loading, error, canManage, refresh } = useFleetVehicles();
  const [query, setQuery] = useState("");
  const [typeId, setTypeId] = useState("all");
  const [status, setStatus] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const editing = vehicles.find((vehicle) => vehicle.vehicle_id === editingId);
  const search = query.trim().toLocaleLowerCase("th-TH");
  const driverName = (id: string | null) => id ? drivers.find((driver) => driver.user_id === id)?.full_name ?? `ผู้ใช้ #${id}` : "ยังไม่กำหนด";
  const typeName = (id: string | null) => types.find((type) => type.vehicle_type_id === id)?.type_name ?? "ยังไม่ระบุ";
  const results = vehicles.filter((vehicle) =>
    (typeId === "all" || vehicle.vehicle_type_id === typeId) &&
    (status === "all" || vehicle.vehicle_status === status) &&
    [vehicle.vehicle_code, vehicle.license_plate, driverName(vehicle.current_driver_id), typeName(vehicle.vehicle_type_id)].some((value) => value.toLocaleLowerCase("th-TH").includes(search)),
  );

  return (
    <DashboardWindow title="จัดการรถ" size="large">
      {editing ? <VehicleForm key={editing.vehicle_id} vehicle={editing} onCancel={() => setEditingId(null)} onSaved={(saved) => { setEditingId(null); setNotice(`บันทึก ${saved.license_plate} เรียบร้อยแล้ว`); }} /> : <>
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--fleet-line)] p-4 sm:px-6">
          <div>
            <h2 className="font-bold">รถใน Workspace</h2>
            <p className="mt-1 text-xs text-[color:var(--fleet-muted)]">ข้อมูลรถและสถานะการใช้งานของบริษัท</p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={loading} onClick={refresh} className={`${control} cursor-pointer font-semibold disabled:opacity-50`}>{loading ? "กำลังโหลด…" : "โหลดรายการใหม่"}</button>
            {canManage && <Link href="/dashboard/manage" className={`inline-flex min-h-11 items-center rounded-xl bg-[var(--fleet-signal)] px-4 text-sm font-bold text-[color:var(--fleet-on-signal)] ${focus}`}>เพิ่มรถ</Link>}
          </div>
        </header>
        <div className="flex shrink-0 flex-wrap gap-2 border-b border-[var(--fleet-line)] p-3 sm:px-6">
          <label className="min-w-0 flex-1 basis-52">
            <span className="sr-only">ค้นหารถหรือคนขับ</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาทะเบียน รหัสรถ หรือคนขับ" className={`${control} w-full min-w-0 bg-[var(--fleet-quiet)] text-base sm:text-sm`} />
          </label>
          <select aria-label="กรองตามประเภทรถ" value={typeId} onChange={(event) => setTypeId(event.target.value)} className={`${control} min-w-0 max-w-[55%]`}>
            <option value="all">ทุกประเภท</option>
            {types.map((type) => <option key={type.vehicle_type_id} value={type.vehicle_type_id}>{type.type_name}</option>)}
          </select>
          <select aria-label="กรองตามสถานะรถ" value={status} onChange={(event) => setStatus(event.target.value)} className={`${control} min-w-0`}>
            <option value="all">ทุกสถานะ</option>
            {Object.entries(vehicleStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        {notice && <p role="status" className="border-b border-[var(--fleet-line)] px-4 py-2 text-sm text-[color:var(--fleet-accent)] sm:px-6">{notice}</p>}
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          {loading ? <p role="status" className="p-6 text-sm">กำลังโหลดรายการรถ…</p> : error ? <p role="alert" className="p-6 text-sm">{fleetErrorMessage(error)}</p> : <>
            <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
              <thead className="sticky top-0 bg-[var(--fleet-quiet)] text-xs text-[color:var(--fleet-muted)]">
                <tr>
                  <th scope="col" className="w-1/2 px-3 py-3 sm:w-[28%] sm:px-6">ทะเบียน / รหัสรถ</th>
                  <th scope="col" className="hidden px-3 py-3 sm:table-cell sm:w-[20%]">ประเภท</th>
                  <th scope="col" className="hidden px-3 py-3 sm:table-cell sm:w-[22%]">คนขับ</th>
                  <th scope="col" className="px-2 py-3 sm:w-[18%]">สถานะ</th>
                  <th scope="col" className="w-16 px-2 py-3 sm:w-[12%]"><span className="sr-only">จัดการ</span></th>
                </tr>
              </thead>
              <tbody>
                {results.map((vehicle) => <tr key={vehicle.vehicle_id} className="hover:bg-[var(--fleet-quiet)] [&>td]:border-b [&>td]:border-[var(--fleet-line)]">
                  <td className="px-3 py-3 wrap-anywhere sm:px-6">
                    <p className="font-semibold">{vehicle.license_plate}</p>
                    <p className="mt-1 text-xs text-[color:var(--fleet-muted)]">{vehicle.vehicle_code}</p>
                    <p className="mt-1 text-xs text-[color:var(--fleet-muted)] sm:hidden">{typeName(vehicle.vehicle_type_id)} · {driverName(vehicle.current_driver_id)}</p>
                  </td>
                  <td className="hidden px-3 py-3 wrap-anywhere sm:table-cell">{typeName(vehicle.vehicle_type_id)}</td>
                  <td className="hidden px-3 py-3 wrap-anywhere sm:table-cell">{driverName(vehicle.current_driver_id)}</td>
                  <td className="px-2 py-3 text-xs sm:text-sm"><span aria-hidden="true" className={`mr-1.5 inline-block size-2 rounded-full ${statusColor[vehicle.vehicle_status]}`} />{vehicleStatusLabels[vehicle.vehicle_status]}</td>
                  <td className="px-1 py-3">{canManage && <button type="button" aria-label={`แก้ไขรถ ${vehicle.license_plate}`} onClick={() => { setEditingId(vehicle.vehicle_id); setNotice(""); }} className={`min-h-11 cursor-pointer rounded-xl px-2 text-xs font-semibold text-[color:var(--fleet-accent)] hover:bg-[var(--fleet-selected)] sm:text-sm ${focus}`}>แก้ไข</button>}</td>
                </tr>)}
              </tbody>
            </table>
            {results.length === 0 && <div className="space-y-3 px-4 py-10 text-center text-sm text-[color:var(--fleet-muted)]">
              <p>{vehicles.length ? "ไม่พบรถที่ตรงกับการค้นหาหรือตัวกรอง" : "ยังไม่มีรถใน Workspace"}</p>
              {!vehicles.length && canManage && <Link href="/dashboard/manage" className={`inline-flex min-h-11 items-center rounded-xl bg-[var(--fleet-selected)] px-4 font-semibold text-[color:var(--fleet-accent)] ${focus}`}>เพิ่มรถคันแรก</Link>}
            </div>}
          </>}
        </div>
        <footer className="flex shrink-0 justify-between gap-3 border-t border-[var(--fleet-line)] bg-[var(--fleet-quiet)] px-4 py-3 text-xs text-[color:var(--fleet-muted)] sm:px-6">
          <span aria-live="polite">{results.length} จาก {vehicles.length} คัน</span>
          <span>สถานะการใช้งานรถ</span>
        </footer>
      </>}
    </DashboardWindow>
  );
}
