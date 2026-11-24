"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ApiResponse, NavigationPlace, NavigationRoute } from "../../../../../packages/shared-types";
import type { JobNavigation } from "@/lib/transport-format";
import NavigationRouteMap from "../_map/navigation-route-map";
import NavigationRouteView from "./navigation-route-view";

const muted = "text-[color:var(--fleet-muted)]";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
const button = `min-h-11 cursor-pointer rounded-xl border border-[var(--fleet-line)] px-3 text-sm font-semibold hover:bg-[var(--fleet-quiet)] disabled:cursor-wait disabled:opacity-50 ${focus}`;

function failureMessage(code: string) {
  switch (code) {
    case "UNAUTHORIZED": return "Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";
    case "FORBIDDEN": return "บัญชีนี้ไม่มีสิทธิ์ใช้งานเส้นทาง";
    case "NAVIGATION_NO_ROUTE": return "ไม่พบเส้นทางรถยนต์ระหว่างหมุดนี้ ลองปรับหมุดให้ใกล้ถนน";
    case "NAVIGATION_RATE_LIMITED": return "มีคำขอค้นหาต่อเนื่อง กรุณารอสักครู่แล้วลองอีกครั้ง";
    case "VALIDATION_ERROR": return "กรุณาตรวจสอบที่อยู่และพิกัดที่เลือก";
    default: return "บริการค้นหาหรือเส้นทางไม่พร้อมใช้งาน กรุณาลองอีกครั้ง";
  }
}

function AddressSearch({ label, name, selected, initialText, onSelect }: { label: string; name: string; selected?: NavigationPlace; initialText?: string; onSelect: (place?: NavigationPlace) => void }) {
  const id = useId();
  const [query, setQuery] = useState(initialText ?? selected?.label ?? "");
  const [results, setResults] = useState<NavigationPlace[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function search() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setResults([]);
    setMessage("");
    try {
      const response = await fetch(`/api/navigation/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: "no-store" });
      const payload = await response.json() as ApiResponse<NavigationPlace[]>;
      if (controller.signal.aborted) return;
      if (!response.ok || !payload.success) {
        setMessage(failureMessage(payload.success ? "NAVIGATION_UNAVAILABLE" : payload.error.code));
        return;
      }
      setResults(payload.data);
      if (!payload.data.length) setMessage("ไม่พบสถานที่ ลองใช้ชื่อสถานที่ ถนน เขต หรือจังหวัดใกล้เคียง");
    } catch {
      if (!controller.signal.aborted) setMessage(failureMessage("NAVIGATION_UNAVAILABLE"));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      <div className="flex min-w-0 gap-2">
        <input id={id} name={name} value={query} required maxLength={255} autoComplete="off" aria-describedby={`${id}-hint`} placeholder="ชื่อสถานที่ ถนน หรือที่อยู่" onChange={(event) => {
          request.current?.abort();
          setBusy(false);
          setQuery(event.target.value);
          setResults([]);
          setMessage("");
          onSelect(undefined);
        }} onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (!busy && query.trim().length >= 2 && query.trim().length <= 200) void search();
          }
        }} className={`min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] px-3 py-2 text-base sm:text-sm ${focus}`} />
        <button type="button" aria-label={`ค้นหา${label}`} disabled={busy || query.trim().length < 2 || query.trim().length > 200} onClick={() => void search()} className={button}>{busy ? "ค้นหา…" : "ค้นหา"}</button>
      </div>
      <p id={`${id}-hint`} className={`text-xs leading-relaxed ${muted}`}>
        {selected ? `เลือกตำแหน่งแล้ว · ${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}` : "กดค้นหาแล้วเลือกสถานที่ เพื่อระบุตำแหน่งบนแผนที่"}
      </p>
      {message && <p role="status" className={`text-xs leading-relaxed ${muted}`}>{message}</p>}
      {results.length > 0 && <ul aria-label={`ผลค้นหา${label}`} className="max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-surface)]">
        {results.map((place) => <li key={place.id} className="border-b border-[var(--fleet-line)] last:border-b-0">
          <button type="button" onClick={() => { setQuery(place.label.slice(0, 255)); setResults([]); setMessage(""); onSelect(place); }} className={`min-h-12 w-full px-3 py-2 text-left text-xs leading-relaxed wrap-anywhere hover:bg-[var(--fleet-selected)] ${focus}`}>{place.label}</button>
        </li>)}
      </ul>}
    </div>
  );
}

export default function NavigationPlanner({ initial, points, pickup, delivery, onChange, onPointsChange }: { initial?: JobNavigation; points?: { origin?: NavigationPlace; destination?: NavigationPlace }; pickup?: string; delivery?: string; onChange: (navigation?: JobNavigation) => void; onPointsChange?: (points: { origin?: NavigationPlace; destination?: NavigationPlace }) => void }) {
  const [origin, setOrigin] = useState<NavigationPlace | undefined>(initial?.origin ?? points?.origin);
  const [destination, setDestination] = useState<NavigationPlace | undefined>(initial?.destination ?? points?.destination);
  const [route, setRoute] = useState<NavigationRoute | undefined>(initial?.route);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  function choose(stop: "origin" | "destination", place?: NavigationPlace) {
    request.current?.abort();
    setBusy(false);
    setRoute(undefined);
    setMessage("");
    if (stop === "origin") setOrigin(place);
    else setDestination(place);
    onPointsChange?.({ origin: stop === "origin" ? place : origin, destination: stop === "destination" ? place : destination });
    onChange(undefined);
  }

  function move(stop: "origin" | "destination", latitude: number, longitude: number) {
    const place = stop === "origin" ? origin : destination;
    if (place) choose(stop, { ...place, id: `pin:${latitude},${longitude}`, latitude, longitude });
  }

  async function calculate() {
    if (!origin || !destination) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setMessage("");
    setRoute(undefined);
    onChange(undefined);
    try {
      const response = await fetch("/api/navigation/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ origin: { latitude: origin.latitude, longitude: origin.longitude }, destination: { latitude: destination.latitude, longitude: destination.longitude } }),
        signal: controller.signal,
      });
      const payload = await response.json() as ApiResponse<NavigationRoute>;
      if (controller.signal.aborted) return;
      if (!response.ok || !payload.success) {
        setMessage(failureMessage(payload.success ? "NAVIGATION_UNAVAILABLE" : payload.error.code));
        return;
      }
      setRoute(payload.data);
      onChange({ origin, destination, route: payload.data });
    } catch {
      if (!controller.signal.aborted) setMessage(failureMessage("NAVIGATION_UNAVAILABLE"));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-3 border-y border-[var(--fleet-line)] py-3">
      <AddressSearch label="จุดรับสินค้า" name="pickup" selected={origin} initialText={pickup} onSelect={(place) => choose("origin", place)} />
      <AddressSearch label="จุดส่งสินค้า" name="delivery" selected={destination} initialText={delivery} onSelect={(place) => choose("destination", place)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" disabled={!origin || !destination || busy} onClick={() => void calculate()} className={`${button} bg-[var(--fleet-selected)] text-[color:var(--fleet-accent)]`}>{busy ? "กำลังคำนวณเส้นทาง…" : "คำนวณเส้นทางถนน"}</button>
        <span className={`text-xs ${muted}`}>เลือกต้นทางและปลายทางเอง</span>
      </div>
      {message && <p role="alert" className="text-xs leading-relaxed text-[color:var(--fleet-accent)]">{message}</p>}
      {origin && destination && <>
        <p className={`text-xs leading-relaxed ${muted}`}>A จุดรับ · B จุดส่ง · ลากหมุดเพื่อปรับทางเข้า แล้วคำนวณเส้นทางอีกครั้ง</p>
        {route ? <NavigationRouteView navigation={{ origin, destination, route }} onMove={move} /> : <NavigationRouteMap origin={origin} destination={destination} onMove={move} />}
      </>}
      <p className={`text-xs leading-relaxed ${muted}`}>ดูเส้นทางตามแผนที่ · ยังไม่ใช้ GPS · ค้นหาจาก Photon / OpenStreetMap</p>
    </div>
  );
}
