"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiResponse, GpsDevice } from "../../../../../packages/shared-types";

class GpsSourceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/fleet/gps-devices${path}`, { cache: "no-store", ...init });
  const result = await response.json() as ApiResponse<T>;
  if (!response.ok || !result.success) throw new GpsSourceError(result.success ? "GPS_UNAVAILABLE" : result.error.code);
  return result.data;
}

function errorCode(error: unknown) {
  return error instanceof GpsSourceError ? error.code : "GPS_UNAVAILABLE";
}

export function gpsSourceError(code: string, writing = false) {
  switch (code) {
    case "UNAUTHORIZED": return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";
    case "FORBIDDEN": return "บัญชีนี้ไม่มีสิทธิ์จัดการแหล่ง GPS ของ Workspace";
    case "NOT_FOUND": return "ไม่พบแหล่ง GPS หรือรถที่เลือก กรุณาโหลดรายการใหม่";
    case "CONFLICT": return "รหัสอุปกรณ์นี้ถูกใช้แล้วใน Workspace";
    case "VALIDATION_ERROR": return "กรุณาตรวจสอบรถ ประเภทแหล่ง GPS และรหัสอุปกรณ์";
    default: return writing ? "ยังยืนยันผลการบันทึกไม่ได้ กรุณาโหลดรายการใหม่ก่อนลองอีกครั้ง" : "โหลดรายการแหล่ง GPS ไม่สำเร็จ";
  }
}

export function useGpsSources(enabled: boolean, companyId: string | null) {
  const [rows, setRows] = useState<GpsDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const loader = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !companyId) return;
    const controller = new AbortController();
    loader.current = controller;
    let fetching = false;

    async function load() {
      if (fetching || controller.signal.aborted || document.visibilityState !== "visible") return;
      fetching = true;
      try {
        const list: GpsDevice[] = [];
        const pageSize = 100;
        for (let offset = 0; ; offset += pageSize) {
          const batch = await request<GpsDevice[]>(`?limit=${pageSize}&offset=${offset}`, { signal: controller.signal });
          if (batch.some((row) => row.company_id !== companyId)) throw new GpsSourceError("FORBIDDEN");
          list.push(...batch);
          if (batch.length < pageSize) break;
        }
        if (!controller.signal.aborted) {
          setRows(list);
          setError(null);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          const code = errorCode(failure);
          if (code === "UNAUTHORIZED" || code === "FORBIDDEN") setRows(null);
          setError(code);
        }
      } finally {
        fetching = false;
      }
    }

    void load();
    const poll = window.setInterval(load, 15_000);
    document.addEventListener("visibilitychange", load);
    window.addEventListener("online", load);
    return () => {
      controller.abort();
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener("online", load);
    };
  }, [enabled, companyId, revision]);

  function refresh() {
    loader.current?.abort();
    setRevision((value) => value + 1);
  }

  async function save(path: string, method: "POST" | "PUT" | "PATCH", payload: object) {
    try {
      const device = await request<GpsDevice>(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (device.company_id !== companyId) throw new GpsSourceError("FORBIDDEN");
      refresh();
      setRows((list) => {
        if (list === null) return [device];
        return list.some((row) => row.gps_device_id === device.gps_device_id)
          ? list.map((row) => row.gps_device_id === device.gps_device_id ? device : row)
          : [...list, device];
      });
      setError(null);
      return { device } as const;
    } catch (failure) {
      const code = errorCode(failure);
      if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
        loader.current?.abort();
        setRows(null);
        setError(code);
      }
      return { error: code } as const;
    }
  }

  return { rows, error, refresh, save };
}
