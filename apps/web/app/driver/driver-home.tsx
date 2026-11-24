import type { AuthenticatedUser } from "../../../../packages/shared-types";
import { UnreadCount } from "./driver-messages";
import { focus, Icon, JobList, muted, primaryButton, Status, surface, type DriverJobEntry } from "./driver-ui";

export default function DriverHome({ user, active, today, now, openJob, openJobs, unread, openMessages }: {
  user: Pick<AuthenticatedUser, "user_id" | "full_name" | "email" | "company_id" | "company_name">;
  active?: DriverJobEntry; today: DriverJobEntry[]; now: string;
  openJob: (entry: DriverJobEntry) => void; openJobs: () => void;
  unread: number; openMessages: () => void;
}) {
  const waiting = today.filter(({ status }) => status === "assigned").length;
  return <div className="space-y-4 sm:space-y-5">
    <section aria-labelledby="driver-name" className={`${surface} driver-profile flex flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between md:px-8`}>
      <span aria-hidden="true" className="driver-route-art"><span className="driver-route-trace" /></span>
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <span aria-hidden="true" className="soft-control grid size-14 shrink-0 place-items-center rounded-[var(--fleet-radius)] bg-[var(--fleet-highlight)] text-xl font-bold text-[var(--fleet-accent)]">{Array.from(user.full_name.trim()).slice(0, 2).join("")}</span>
        <div className="min-w-0"><h1 id="driver-name" data-driver-heading tabIndex={-1} className="text-2xl font-bold break-words sm:text-4xl">{user.full_name}</h1><p className={`mt-1 text-sm ${muted}`}>พนักงานขับรถ</p><p className="mt-1 text-sm font-semibold leading-relaxed wrap-anywhere text-[var(--fleet-accent)]" aria-label={`บริษัท ${user.company_name ?? `Workspace ${user.company_id}`}`}>{user.company_name ?? `Workspace ${user.company_id}`}</p><p className={`mt-1 text-xs break-all ${muted}`}>{user.email}</p><p className={`mt-1 font-mono text-xs ${muted}`}>รหัสผู้ใช้ {user.user_id}</p></div>
      </div>
      <div className={`soft-control flex w-fit items-center gap-2 rounded-xl bg-[var(--fleet-highlight)] px-3 py-2 text-xs ${muted}`}><Icon name="calendar" className="size-4" /><time dateTime={now}>{new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }).format(new Date(now))}</time></div>
    </section>
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <section className={`${surface} p-4 sm:p-5 ${active ? "driver-active-panel" : ""}`} aria-labelledby="active-title">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="active-title" className="flex items-center gap-2 font-bold"><Icon name="truck" />งานที่กำลังรับอยู่</h2>{active && <Status status={active.status} />}</div>
          {active ? <div className="mt-3 space-y-3 border-t border-[var(--fleet-line)] pt-3"><p className="text-lg font-bold break-words">{active.job.job_name ?? active.job.job_code}</p><p className={`text-sm ${muted}`}>{active.job.job_code} · {active.job.vehicle?.license_plate ?? "ยังไม่ระบุรถ"}</p>{active.job.job_status === "problem" && <p className="text-sm whitespace-pre-wrap text-[var(--fleet-accent)]">{active.job.problem_note}</p>}<button type="button" onClick={() => openJob(active)} className={`${primaryButton} w-full sm:w-fit`}>เปิดงานที่รับอยู่<Icon name="arrow" className="size-4" /></button></div> : <p className={`mt-3 text-sm ${muted}`}>ยังไม่มีงานที่กำลังทำ</p>}
        </section>
        <section aria-labelledby="today-title" className={`${surface} p-3 sm:p-4`}><div className="mb-3 flex items-center justify-between gap-2"><h2 id="today-title" className="flex items-center gap-2 font-bold"><Icon name="calendar" />งานวันนี้</h2><span className={`text-xs ${muted}`}>{today.length} งาน</span></div><JobList entries={today} onOpen={openJob} empty="วันนี้ยังไม่มีงานที่ได้รับมอบหมาย" /></section>
      </div>
      <section aria-labelledby="notices-title" className={`${surface} min-w-0 p-4 sm:p-5`}><h2 id="notices-title" className="mb-3 flex items-center gap-2 font-bold"><Icon name="bell" />แจ้งเตือน</h2><div className="space-y-3">
        {unread > 0 && <button type="button" onClick={openMessages} className={`flex min-h-14 w-full items-center gap-2 rounded-xl bg-[var(--fleet-selected)] p-3 text-left text-sm font-bold text-[var(--fleet-accent)] ${focus}`}><Icon name="chat" className="size-5 shrink-0" /><span className="flex-1">ข้อความใหม่จาก Dispatch</span><UnreadCount count={unread} /></button>}
        {waiting > 0 && <button type="button" onClick={openJobs} className={`min-h-14 w-full rounded-xl bg-[var(--fleet-selected)] p-3 text-left text-sm font-bold text-[var(--fleet-accent)] ${focus}`}>วันนี้มี {waiting} งานรอรับ · ดูรายการงาน</button>}
        <p className={`rounded-xl bg-[var(--fleet-quiet)] p-3 text-sm leading-relaxed ${muted}`}>ตรวจทะเบียนรถและเส้นทางให้ตรงกับใบงานก่อนยืนยันเริ่มงาน หากพบปัญหา ให้แจ้งผ่านหน้ารายละเอียดงาน</p>
        <button type="button" onClick={openJobs} className={`min-h-11 text-sm font-semibold text-[var(--fleet-accent)] ${focus}`}>ดูงานทั้งหมด</button>
      </div></section>
    </div>
  </div>;
}
