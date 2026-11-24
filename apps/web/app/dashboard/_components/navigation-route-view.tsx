"use client";

import { useState } from "react";
import NavigationRouteMap from "../_map/navigation-route-map";
import type { JobNavigation } from "@/lib/transport-format";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";

export default function NavigationRouteView({ navigation, onMove }: { navigation: JobNavigation; onMove?: (stop: "origin" | "destination", latitude: number, longitude: number) => void }) {
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const { origin, destination, route } = navigation;
  const distance = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 }).format(route.distance_meters / 1000);

  return (
    <section aria-label="เส้นทางตามถนนจริง" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold">{distance} กม. <span className="font-normal text-[color:var(--fleet-muted)]">· ประมาณ {Math.max(1, Math.round(route.duration_seconds / 60))} นาที</span></p>
          <p className="mt-1 text-xs text-[color:var(--fleet-muted)]">เส้นทางรถยนต์ · เวลาโดยประมาณจากข้อมูลถนน</p>
        </div>
        <button type="button" onClick={() => { setStepIndex(null); setRecenterKey((value) => value + 1); }} className={`min-h-10 rounded-xl border border-[var(--fleet-line)] px-3 text-xs font-semibold hover:bg-[var(--fleet-quiet)] ${focus}`}>ดูเส้นทางทั้งหมด</button>
      </div>
      {stepIndex !== null && <p role="status" className="rounded-xl bg-[var(--fleet-selected)] px-3 py-2 text-sm text-[color:var(--fleet-accent)]">{route.steps[stepIndex]?.instruction}</p>}
      <NavigationRouteMap origin={origin} destination={destination} route={route} stepIndex={stepIndex} recenterKey={recenterKey} onMove={onMove} />
      <details className="rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-quiet)]">
        <summary className={`cursor-pointer px-3 py-3 text-sm font-semibold ${focus}`}>คำแนะนำตามเส้นทาง · {route.steps.length} ช่วง</summary>
        <ol className="max-h-60 space-y-1 overflow-y-auto overscroll-contain px-2 pb-2">
          {route.steps.map((step, index) => <li key={index}>
            <button type="button" aria-pressed={stepIndex === index} onClick={() => setStepIndex(index)} className={`flex min-h-11 w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs leading-relaxed ${focus} ${stepIndex === index ? "bg-[var(--fleet-selected)] text-[color:var(--fleet-accent)]" : "hover:bg-[var(--fleet-surface)]"}`}>
              <span>{index + 1}. {step.instruction}</span>
              <span className="shrink-0 tabular-nums">{step.distance_meters >= 1000 ? `${(step.distance_meters / 1000).toFixed(1)} กม.` : `${Math.round(step.distance_meters)} ม.`}</span>
            </button>
          </li>)}
        </ol>
      </details>
      <p className="text-xs leading-relaxed text-[color:var(--fleet-muted)]">เส้นทาง Valhalla · ค้นหาสถานที่ Photon · ข้อมูล <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap</a> · คำสั่งเลี้ยวจากผู้ให้บริการเป็นภาษาอังกฤษ</p>
    </section>
  );
}
