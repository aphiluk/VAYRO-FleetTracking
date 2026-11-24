import Link from "next/link";
import { logout } from "@/lib/auth-actions";
import { AdminPage, demoFleet, directorySurface } from "../_components/admin-directory";
import TestRolePanel from "./test-role-panel";

export const metadata = { title: "เพิ่มเติม | VAYRO" };

export default function MorePage() {
  const offlineCount = demoFleet.filter(
    ({ status }) => status === "offline",
  ).length;

  return (
    <AdminPage
      title="เพิ่มเติม"
      description="บทบาททดสอบ สัญญาณ GPS และการเข้าถึง Workspace"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TestRolePanel />
        <section
          className={`${directorySurface} p-4 sm:p-5`}
          aria-labelledby="gps-heading"
        >
          <h2 id="gps-heading" className="font-semibold">
            สัญญาณ GPS จำลอง
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-[color:var(--fleet-muted)]">ส่งพิกัด</dt>
              <dd>{demoFleet.length - offlineCount} คัน</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[color:var(--fleet-muted)]">ขาดสัญญาณ</dt>
              <dd>{offlineCount} คัน</dd>
            </div>
          </dl>
        </section>
        <section
          className={`${directorySurface} p-4 sm:p-5`}
          aria-labelledby="workspace-heading"
        >
          <h2 id="workspace-heading" className="font-semibold">
            Workspace
          </h2>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <form action={logout}>
              <button type="submit" className="cursor-pointer rounded-lg bg-[var(--fleet-quiet)] px-3 py-2.5 hover:bg-[var(--fleet-selected)]">
                ออกจากระบบ
              </button>
            </form>
            <Link
              href="/register"
              className="rounded-lg bg-[var(--fleet-quiet)] px-3 py-2.5 hover:bg-[var(--fleet-selected)]"
            >
              ขอเปิด Workspace
            </Link>
          </div>
        </section>
      </div>
    </AdminPage>
  );
}
