import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canUseEmployeeWorkspace, readSession } from "@/lib/auth-gateway";
import "maplibre-gl/dist/maplibre-gl.css";
import DriverWorkspace from "./driver-workspace";
import { TransportJobsProvider } from "@/lib/transport-client";
import "./driver-appearance.css";

export const metadata: Metadata = {
  title: "หน้าแรกคนขับ | VAYRO Driver",
  description: "ดูงานวันนี้ แจ้งเตือน และประวัติงานขนส่งสำหรับคนขับ VAYRO",
  robots: { index: false, follow: false },
};

export default function DriverPage() {
  return (
    <Suspense fallback={<p role="status" className="p-6">กำลังตรวจสอบบัญชีคนขับ…</p>}>
      <SignedInDriver />
    </Suspense>
  );
}

async function SignedInDriver() {
  const session = await readSession();
  if (!session.ok) {
    if (session.code !== "AUTH_UNAVAILABLE") redirect("/login");
    return <main className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-bold">ตรวจสอบบัญชีคนขับไม่ได้</h1>
      <p className="mt-2">ระบบยืนยันตัวตนไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง</p>
      <Link href="/login" className="mt-4 inline-block underline">กลับไปหน้าเข้าสู่ระบบ</Link>
    </main>;
  }
  if (canUseEmployeeWorkspace(session.data)) redirect("/dashboard");
  if (session.data.role !== "driver" || session.data.company_id === null) redirect("/login");

  const { user_id, full_name, email, company_id, company_name } = session.data;
  return <TransportJobsProvider key={`${company_id}:${user_id}`} mode="driver"><DriverWorkspace user={{ user_id, full_name, email, company_id, company_name }} initialNow={new Date().toISOString()} /></TransportJobsProvider>;
}
