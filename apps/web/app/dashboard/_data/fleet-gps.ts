"use client";

import { useEffect, useState } from "react";
import type { ApiResponse, FleetGpsPoint, FleetGpsSnapshot } from "../../../../../packages/shared-types";

const POLL_MS = 5_000;
const BATCH_SIZE = 100;
const EMPTY = new Map<string, FleetGpsPoint>();

export function useFleetGps(companyId: string | null, vehicleIds: string, enabled: boolean) {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    companyId: string;
    vehicleIds: string;
    points: Map<string, FleetGpsPoint>;
    error: string | null;
  }>();
  const current = snapshot?.companyId === companyId && snapshot.vehicleIds === vehicleIds ? snapshot : undefined;

  useEffect(() => {
    if (!enabled || !vehicleIds || !companyId) return;
    const scope = { companyId, vehicleIds };
    const ids = vehicleIds.split(",");
    const controller = new AbortController();
    let fetching = false;

    async function load() {
      if (fetching || controller.signal.aborted || document.visibilityState !== "visible") return;
      fetching = true;
      try {
        const points = new Map<string, FleetGpsPoint>();
        for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
          const batch = ids.slice(offset, offset + BATCH_SIZE);
          const query = new URLSearchParams({ vehicle_ids: batch.join(",") });
          const response = await fetch(`/api/fleet/gps/latest?${query}`, { cache: "no-store", signal: controller.signal });
          if (response.status === 401 || response.status === 403) {
            if (!controller.signal.aborted) setSnapshot({ ...scope, points: EMPTY, error: "บัญชีนี้ไม่สามารถอ่าน GPS ได้ กรุณาตรวจสอบสิทธิ์หรือเข้าสู่ระบบอีกครั้ง" });
            return;
          }
          const payload = await response.json() as ApiResponse<FleetGpsSnapshot>;
          if (!response.ok || !payload.success || payload.data.company_id !== scope.companyId || !Array.isArray(payload.data.points)) {
            throw new Error("GPS unavailable");
          }
          const allowed = new Set(batch);
          for (const point of payload.data.points) {
            if (!allowed.has(point.vehicle_id)) throw new Error("Unexpected GPS vehicle");
            points.set(point.vehicle_id, point);
          }
        }
        if (!controller.signal.aborted) setSnapshot({ ...scope, points, error: null });
      } catch {
        if (!controller.signal.aborted) {
          setSnapshot((previous) => ({
            ...scope,
            points: previous?.companyId === scope.companyId && previous.vehicleIds === vehicleIds ? previous.points : EMPTY,
            error: "โหลดพิกัด GPS ไม่สำเร็จ",
          }));
        }
      } finally {
        fetching = false;
      }
    }

    void load();
    const timer = window.setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    window.addEventListener("online", load);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener("online", load);
    };
  }, [companyId, enabled, revision, vehicleIds]);

  return {
    points: enabled ? current?.points ?? EMPTY : EMPTY,
    error: enabled ? current?.error ?? null : null,
    loading: enabled && Boolean(companyId && vehicleIds) && !current,
    refresh: () => setRevision((value) => value + 1),
  };
}
