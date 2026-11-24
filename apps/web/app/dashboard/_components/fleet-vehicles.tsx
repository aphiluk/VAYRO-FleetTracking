"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ApiResponse, CreateVehicleRequest, UpdateVehicleRequest, User, VehicleRecord, VehicleTypeRecord } from "../../../../../packages/shared-types";

type Result<T> = { ok: true; data: T } | { ok: false; code: string };
type FleetData = { vehicles: VehicleRecord[]; types: VehicleTypeRecord[]; drivers: User[] };
type FleetContext = FleetData & {
  loading: boolean;
  error: string | null;
  canManage: boolean;
  checkedAt: string | null;
  refresh: () => void;
  saveVehicle: (input: CreateVehicleRequest | UpdateVehicleRequest, id?: string) => Promise<Result<VehicleRecord>>;
  createType: (name: string) => Promise<Result<VehicleTypeRecord>>;
};

const Context = createContext<FleetContext | null>(null);

export const vehicleStatusLabels = { active: "ใช้งาน", inactive: "หยุดใช้งาน", maintenance: "ซ่อมบำรุง" } as const;

export function fleetErrorMessage(code: string) {
  switch (code) {
    case "UNAUTHORIZED": return "Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";
    case "FORBIDDEN": return "บัญชีนี้ไม่มีสิทธิ์จัดการรถใน Workspace นี้";
    case "CONFLICT": return "รหัสรถหรือชื่อประเภทรถนี้มีอยู่แล้ว กรุณาตรวจสอบรายการ";
    case "VALIDATION_ERROR": return "กรุณาตรวจสอบรหัสรถ ทะเบียน ประเภท และคนขับที่เลือก";
    case "NOT_FOUND": return "ไม่พบข้อมูลที่เลือก กรุณาโหลดรายการใหม่";
    default: return "ยังยืนยันผลคำขอไม่ได้ กรุณาโหลดรายการใหม่เพื่อตรวจสอบข้อมูลก่อนลองอีกครั้ง";
  }
}

async function requestFleet<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const response = await fetch(`/api/fleet/${path}`, { cache: "no-store", ...init });
    const payload = await response.json() as ApiResponse<T>;
    if (response.ok && payload.success) return { ok: true, data: payload.data };
    return { ok: false, code: payload.success ? "FLEET_UNAVAILABLE" : payload.error.code };
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    return { ok: false, code: "FLEET_UNAVAILABLE" };
  }
}

async function loadAll<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const result = await requestFleet<T[]>(`${path}?limit=100&offset=${offset}`, { signal });
    if (!result.ok) throw new Error(result.code);
    rows.push(...result.data);
    if (result.data.length < 100) return rows;
  }
}

export function FleetVehiclesProvider({ children, canManage }: { children: ReactNode; canManage: boolean }) {
  const [data, setData] = useState<FleetData>({ vehicles: [], types: [], drivers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const loader = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loader.current = controller;
    let fetching = false;
    async function load() {
      if (fetching || controller.signal.aborted) return;
      fetching = true;
      try {
        const [vehicles, types, users] = await Promise.all([
          loadAll<VehicleRecord>("vehicles", controller.signal),
          loadAll<VehicleTypeRecord>("vehicle-types", controller.signal),
          canManage ? loadAll<User>("drivers", controller.signal) : Promise.resolve([]),
        ]);
        if (controller.signal.aborted) return;
        setData({ vehicles, types, drivers: users.filter((user) => user.role === "driver") });
        setCheckedAt(new Date().toISOString()); setError(null);
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "FLEET_UNAVAILABLE"); }
      finally { fetching = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(visible, 30_000);
    document.addEventListener("visibilitychange", visible); window.addEventListener("online", visible);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", visible); };
  }, [canManage, revision]);

  function refresh() {
    loader.current?.abort();
    setLoading(true);
    setError(null);
    setRevision((value) => value + 1);
  }

  async function saveVehicle(input: CreateVehicleRequest | UpdateVehicleRequest, id?: string) {
    if (!canManage) return { ok: false, code: "FORBIDDEN" } as const;
    const result = await requestFleet<VehicleRecord>(id ? `vehicles/${id}` : "vehicles", {
      method: id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
    if (result.ok) {
      loader.current?.abort();
      setRevision((value) => value + 1);
      window.dispatchEvent(new Event("vayro:summary-changed"));
      setLoading(false);
      setError(null);
      setData((current) => ({ ...current, vehicles: [result.data, ...current.vehicles.filter((vehicle) => vehicle.vehicle_id !== result.data.vehicle_id)] }));
    }
    return result;
  }

  async function createType(name: string) {
    if (!canManage) return { ok: false, code: "FORBIDDEN" } as const;
    const result = await requestFleet<VehicleTypeRecord>("vehicle-types", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type_name: name }) });
    if (result.ok) {
      loader.current?.abort();
      setRevision((value) => value + 1);
      window.dispatchEvent(new Event("vayro:summary-changed"));
      setLoading(false);
      setError(null);
      setData((current) => ({ ...current, types: [...current.types.filter((type) => type.vehicle_type_id !== result.data.vehicle_type_id), result.data] }));
    }
    return result;
  }

  return <Context.Provider value={{ ...data, loading, error, canManage, checkedAt, refresh, saveVehicle, createType }}>{children}</Context.Provider>;
}

export function useFleetVehicles() {
  const fleet = useContext(Context);
  if (!fleet) throw new Error("Fleet vehicles must be used inside Dashboard");
  return fleet;
}
