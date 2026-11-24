import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import "maplibre-gl/dist/maplibre-gl.css";
import { canUseEmployeeWorkspace, readSession } from "@/lib/auth-gateway";
import AdminShell from "./_components/admin-shell";
import { TransportJobsProvider } from "@/lib/transport-client";
import FleetDashboard from "./_map/fleet-dashboard";
import { FleetVehiclesProvider } from "./_components/fleet-vehicles";
import { CompanySummaryProvider } from "@/lib/company-summary";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6" role="status">กำลังตรวจสอบบัญชี…</p>}>
      <SignedInDashboard>{children}</SignedInDashboard>
    </Suspense>
  );
}

async function SignedInDashboard({ children }: { children: ReactNode }) {
  const session = await readSession();
  if (!session.ok) {
    if (session.code !== "AUTH_UNAVAILABLE") redirect("/login");
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-bold">ตรวจสอบบัญชีไม่ได้</h1>
        <p className="mt-2">ระบบยืนยันตัวตนไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง</p>
        <Link href="/login" className="mt-4 inline-block underline">กลับไปหน้าเข้าสู่ระบบ</Link>
      </main>
    );
  }

  if (session.data.role === "driver" && session.data.company_id !== null) redirect("/driver");
  if (!canUseEmployeeWorkspace(session.data)) redirect("/login");

  const { full_name, user_id, role, company_id, company_name } = session.data;
  return (
    <TransportJobsProvider key={`${company_id}:${user_id}:${role}`} mode="company">
      <CompanySummaryProvider companyId={company_id} canView={role === "company_admin"}>
      <FleetVehiclesProvider canManage={role === "company_admin"}>
      <AdminShell user={{ full_name, user_id, role, company_id, company_name }} map={<FleetDashboard />}>
        {children}
      </AdminShell>
      </FleetVehiclesProvider>
      </CompanySummaryProvider>
    </TransportJobsProvider>
  );
}
