"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ApiResponse, CreateTransportJobRequest, TransportJobRecord, UpdateTransportJobRequest } from "../../../packages/shared-types";

type Result<T> = { ok: true; data: T } | { ok: false; code: string };
export type JobAction = "accept" | "start" | "complete" | "problem" | "cancel";
type JobsContext = {
  jobs: TransportJobRecord[];
  loading: boolean;
  error: string | null;
  pending: boolean;
  refresh: () => void;
  saveJob: (input: CreateTransportJobRequest | UpdateTransportJobRequest, id?: string) => Promise<Result<TransportJobRecord>>;
  actOnJob: (id: string, action: JobAction, note?: string) => Promise<Result<TransportJobRecord>>;
};
const Context = createContext<JobsContext | null>(null);

export function transportErrorMessage(code: string) {
  switch (code) {
    case "UNAUTHORIZED": return "Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";
    case "FORBIDDEN": return "บัญชีนี้ไม่มีสิทธิ์จัดการงานนี้";
    case "NOT_FOUND": return "ไม่พบงาน รถ หรือคนขับที่เลือก กรุณาโหลดข้อมูลใหม่";
    case "CONFLICT": return "รหัสงานซ้ำ หรือสถานะงาน รถ หรือคนขับเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่เพื่อตรวจสอบ";
    case "VALIDATION_ERROR": return "กรุณาตรวจสอบข้อมูล รถที่ใช้งานได้ และบัญชี Driver ที่เลือก";
    default: return "ยังยืนยันผลคำขอไม่ได้ กรุณาโหลดงานใหม่ก่อนลองอีกครั้ง";
  }
}

async function requestJobs<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const response = await fetch(`/api/transport/${path}`, { cache: "no-store", ...init });
    const payload = await response.json() as ApiResponse<T>;
    if (response.ok && payload.success) return { ok: true, data: payload.data };
    return { ok: false, code: payload.success ? "TRANSPORT_UNAVAILABLE" : payload.error.code };
  } catch (failure) {
    if (init?.signal?.aborted) throw failure;
    return { ok: false, code: "TRANSPORT_UNAVAILABLE" };
  }
}

export function TransportJobsProvider({ mode, children }: { mode: "company" | "driver"; children: ReactNode }) {
  const [jobs, setJobs] = useState<TransportJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const epoch = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    async function load() {
      if (fetching || controller.signal.aborted) return;
      fetching = true;
      const generation = epoch.current;
      try {
        const records: TransportJobRecord[] = [];
        for (let offset = 0; ; offset += 100) {
          const result = await requestJobs<TransportJobRecord[]>(`${mode === "driver" ? "driver/jobs" : "jobs"}?limit=100&offset=${offset}`, { signal: controller.signal });
          if (!result.ok) throw new Error(result.code);
          records.push(...result.data);
          if (result.data.length < 100) break;
        }
        if (!controller.signal.aborted && generation === epoch.current && !busy.current) {
          setJobs((previous) => records.map((record) => previous.find((old) => old.job_id === record.job_id && old.updated_at === record.updated_at) ?? record));
          setError(null);
        }
      } catch (failure) {
        if (!controller.signal.aborted && generation === epoch.current) setError(failure instanceof Error ? failure.message : "TRANSPORT_UNAVAILABLE");
      } finally {
        fetching = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const whenVisible = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(whenVisible, 15_000);
    document.addEventListener("visibilitychange", whenVisible);
    window.addEventListener("online", whenVisible);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", whenVisible); window.removeEventListener("online", whenVisible); };
  }, [mode, revision]);

  function refresh() { epoch.current++; setLoading(true); setRevision((value) => value + 1); }

  async function mutate(path: string, method: string, input: object): Promise<Result<TransportJobRecord>> {
    if (busy.current) return { ok: false, code: "CONFLICT" };
    busy.current = true;
    epoch.current++;
    setPending(true);
    try {
      const result = await requestJobs<TransportJobRecord>(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      if (result.ok) {
        window.dispatchEvent(new Event("vayro:summary-changed"));
        setJobs((current) => [result.data, ...current.filter((job) => job.job_id !== result.data.job_id)]);
        setError(null);
      }
      return result;
    } finally {
      epoch.current++;
      busy.current = false;
      setPending(false);
      setRevision((value) => value + 1);
    }
  }

  return <Context.Provider value={{ jobs, loading, error, pending, refresh,
    saveJob: (input, id) => mutate(id ? `jobs/${id}` : "jobs", id ? "PUT" : "POST", input),
    actOnJob: (id, action, note) => mutate(`jobs/${id}/${action}`, "PATCH", action === "problem" ? { problem_note: note } : {}),
  }}>{children}</Context.Provider>;
}

export function useTransportJobs() {
  const jobs = useContext(Context);
  if (!jobs) throw new Error("Transport jobs require TransportJobsProvider");
  return jobs;
}
