"use client";

import Link from "next/link";
import { useState } from "react";
import type { VehicleRecord } from "../../../../../packages/shared-types";
import VehicleForm from "../_components/vehicle-form";

const button = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";

export default function AddVehicleForm() {
  const [saved, setSaved] = useState<VehicleRecord | null>(null);
  if (!saved) return <VehicleForm onSaved={setSaved} />;

  return <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-5 text-center">
    <div className="max-w-md">
      <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--fleet-selected)] text-[color:var(--fleet-accent)]">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
      </span>
      <h2 tabIndex={-1} className="mt-4 text-xl font-bold">เพิ่มรถเรียบร้อยแล้ว</h2>
      <p role="status" className="mt-2 text-sm break-words text-[color:var(--fleet-muted)]">{saved.vehicle_code} · {saved.license_plate}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => setSaved(null)} className={`${button} hover:bg-[var(--fleet-quiet)]`}>เพิ่มรถอีกคัน</button>
        <Link href="/dashboard/vehicles" className={`${button} bg-[var(--fleet-signal)] text-[color:var(--fleet-on-signal)]`}>ดูรายการรถ</Link>
      </div>
    </div>
  </div>;
}
