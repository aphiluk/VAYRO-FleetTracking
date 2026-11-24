"use client";

import { useState, type ReactNode } from "react";
import AddEmployeeForm from "./add-employee-form";
import ManageGpsSources from "./manage-gps-sources";
import ManageJobs from "./manage-jobs";

const sections = [
  { id: "vehicle", label: "เพิ่มรถ", icon: "M3 17V7a1 1 0 0 1 1-1h11v11m0-7h3l3 4v3h-2m-9 0h5m-10 0H3 M7.5 15a2 2 0 1 0 .01 4 2 2 0 0 0-.01-4m9.5 0a2 2 0 1 0 .01 4 2 2 0 0 0-.01-4" },
  { id: "gps", label: "แหล่ง GPS", icon: "M12 21s6-5.2 6-11a6 6 0 0 0-12 0c0 5.8 6 11 6 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" },
  { id: "employee", label: "เพิ่มคน", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m17-13v6m-3-3h6 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8" },
  { id: "jobs", label: "จัดการงาน", icon: "M9 5H6a2 2 0 0 0-2 2v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7a2 2 0 0 0-2-2h-3m-6 0a3 3 0 0 1 6 0v1H9V5Zm-1 6h8m-8 5h8" },
] as const;

export default function ManageSections({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<(typeof sections)[number]["id"]>("vehicle");

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
      <nav aria-label="เมนูจัดการ" className="shrink-0 border-b border-[var(--fleet-line)] bg-[var(--fleet-quiet)] p-2 sm:w-40 sm:border-r sm:border-b-0 sm:p-3 lg:w-52 lg:p-4">
        <ul className="grid grid-cols-2 gap-1 min-[420px]:grid-cols-4 sm:grid-cols-1">
          {sections.map(({ id, label, icon }) => (
            <li key={id} className="min-w-0">
              <button type="button" aria-pressed={active === id} aria-controls={`manage-${id}`} onClick={() => setActive(id)} className={`flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--fleet-focus)] sm:justify-start sm:px-3 sm:text-sm ${active === id ? "soft-inset bg-[var(--fleet-selected)] text-[color:var(--fleet-accent)]" : "text-[color:var(--fleet-muted)] hover:bg-[var(--fleet-surface)]"}`}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="hidden size-[19px] shrink-0 sm:block" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div id="manage-vehicle" className={active === "vehicle" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>{children}</div>
        <div id="manage-gps" className={active === "gps" ? "flex min-h-0 flex-1 flex-col" : "hidden"}><ManageGpsSources active={active === "gps"} /></div>
        <div id="manage-employee" className={active === "employee" ? "flex min-h-0 flex-1 flex-col" : "hidden"}><AddEmployeeForm /></div>
        <div id="manage-jobs" className={active === "jobs" ? "flex min-h-0 flex-1 flex-col" : "hidden"}><ManageJobs /></div>
      </div>
    </div>
  );
}
