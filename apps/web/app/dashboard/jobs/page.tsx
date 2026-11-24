import { AdminPage, directorySurface } from "../_components/admin-directory";
import TransportJobList from "../_components/transport-job-list";

export const metadata = { title: "งานขนส่ง | VAYRO" };

export default function JobsPage() {
  return (
    <AdminPage title="งานขนส่ง" description="จุดรับ–ส่ง รถ และคนขับที่ได้รับมอบหมายในแต่ละงาน">
      <section className={`${directorySurface} p-4 sm:p-6`} aria-labelledby="jobs-preview">
        <h2 id="jobs-preview" className="mb-3 font-semibold">รายการงานขนส่ง</h2>
        <TransportJobList />
      </section>
    </AdminPage>
  );
}
