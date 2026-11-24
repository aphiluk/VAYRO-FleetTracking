"use client";

import { useRef, useState, type FormEvent } from "react";

const roles = {
  dispatcher: { title: "Dispatcher", description: "ดูตำแหน่งรถและประสานงานขนส่ง" },
  driver: { title: "Driver", description: "ดูงานที่ได้รับมอบหมายและใช้แอปคนขับ" },
  company_admin: { title: "Company Admin", description: "ดูแลสมาชิก รถ และอุปกรณ์ GPS ของบริษัท" },
} as const;

type InviteRole = keyof typeof roles;
type DemoInvite = { name: string; email: string; role: InviteRole };
type Feedback = { kind: "duplicate" | "invalid" | "success"; message: string };

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
const input = `min-h-11 w-full min-w-0 rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] px-3 py-2 text-base sm:text-sm ${focus}`;
const muted = "text-[color:var(--fleet-muted)]";
const panel = "soft-card border border-[var(--fleet-line)] bg-[var(--fleet-surface)]";

function isInviteRole(value: string): value is InviteRole {
  return Object.hasOwn(roles, value);
}

export default function AddEmployeeForm() {
  const [invites, setInvites] = useState<DemoInvite[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  function inviteEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("full-name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const role = String(data.get("role") ?? "");

    if (!email || !isInviteRole(role)) {
      setFeedback({ kind: "invalid", message: "กรุณากรอกอีเมลและเลือกบทบาท" });
      return;
    }
    if (invites.some((invite) => invite.email === email)) {
      setFeedback({ kind: "duplicate", message: "อีเมลนี้อยู่ในรายการคำเชิญทดลองแล้ว" });
      emailInput.current?.focus();
      return;
    }

    setInvites((current) => [{ name, email, role }, ...current]);
    form.reset();
    setFeedback({ kind: "success", message: `บันทึกคำเชิญทดลองสำหรับ ${email} แล้ว` });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-[var(--fleet-line)] pb-4">
        <div>
          <h2 className="text-lg font-bold sm:text-xl">เชิญพนักงาน</h2>
          <p className={`mt-1 text-sm leading-relaxed ${muted}`}>ระบุอีเมลและบทบาทสำหรับเข้าร่วม Workspace</p>
        </div>
        <span className="soft-inset rounded-full bg-[var(--fleet-selected)] px-2.5 py-1 text-xs font-bold text-[color:var(--fleet-accent)]">เดโม</span>
      </header>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <form onSubmit={inviteEmployee} className={`${panel} min-w-0 space-y-4 p-3.5 sm:p-4`}>
          <div className="space-y-3">
            <label className="grid min-w-0 gap-1.5 text-sm font-semibold">
              อีเมลพนักงาน
              <input ref={emailInput} name="email" type="email" autoComplete="off" required maxLength={150} placeholder="เช่น name@example.com" aria-invalid={feedback?.kind === "duplicate" || undefined} aria-describedby={feedback?.kind === "duplicate" ? "manage-invite-feedback" : undefined} onChange={() => setFeedback(null)} className={input} />
            </label>
            <label className="grid min-w-0 gap-1.5 text-sm font-semibold">
              ชื่อพนักงาน (ไม่บังคับ)
              <input name="full-name" type="text" autoComplete="off" maxLength={150} className={input} />
            </label>
          </div>

          <fieldset className="min-w-0 space-y-2">
            <legend className="mb-2 text-sm font-bold">บทบาทใน Workspace</legend>
            {Object.entries(roles).map(([value, { title, description }]) => (
              <label key={value} className="group block cursor-pointer">
                <input type="radio" name="role" value={value} required className="peer sr-only" />
                <span className="flex items-center gap-3 rounded-xl border border-[var(--fleet-line)] px-3 py-2.5 hover:bg-[var(--fleet-quiet)] peer-checked:border-[var(--fleet-signal)] peer-checked:bg-[var(--fleet-selected)] peer-checked:text-[color:var(--fleet-accent)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--fleet-focus)]">
                  <span aria-hidden="true" className="grid size-3.5 shrink-0 place-items-center rounded-full border border-current"><span className="size-1.5 rounded-full bg-current opacity-0 group-has-checked:opacity-100" /></span>
                  <span><span className="block text-sm font-bold">{title}</span><span className={`block text-xs leading-relaxed ${muted}`}>{description}</span></span>
                </span>
              </label>
            ))}
          </fieldset>

          {feedback && (
            <p id="manage-invite-feedback" role={feedback.kind === "success" ? "status" : "alert"} className={`text-sm leading-relaxed [overflow-wrap:anywhere] ${feedback.kind === "success" ? muted : "text-[color:var(--fleet-accent)]"}`}>{feedback.message}</p>
          )}
          <button type="submit" className={`flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--fleet-signal)] px-3 text-sm font-bold text-[color:var(--fleet-on-signal)] hover:bg-[var(--fleet-signal-hover)] ${focus}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm-1 1 9 6 9-6" /></svg>
            สร้างคำเชิญทดลอง
          </button>
        </form>

        <section aria-labelledby="manage-invite-list-title" className={`${panel} min-w-0 p-3.5 sm:p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="manage-invite-list-title" className="text-sm font-bold">คำเชิญทดลอง</h3>
            <span className={`soft-inset rounded-full bg-[var(--fleet-quiet)] px-2.5 py-1 text-xs ${muted}`}>{invites.length} รายการ</span>
          </div>
          <p className={`mt-2 text-xs leading-relaxed ${muted}`}>เก็บไว้ในหน้าต่างนี้จนกว่าจะปิดหรือรีเฟรช โดยไม่มีการส่งอีเมล</p>
          {invites.length === 0 ? (
            <p className={`mt-3 rounded-xl border border-dashed border-[var(--fleet-line)] px-3 py-5 text-center text-sm ${muted}`}>ยังไม่มีคำเชิญทดลอง</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {invites.map(({ name, email, role }) => (
                <li key={email} className="min-w-0 rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-highlight)] px-3 py-2.5">
                  {name && <p className="text-sm font-bold [overflow-wrap:anywhere]">{name}</p>}
                  <p className={`text-sm [overflow-wrap:anywhere] ${name ? muted : "font-semibold"}`}>{email}</p>
                  <span className="mt-1.5 inline-flex rounded-full bg-[var(--fleet-selected)] px-2 py-0.5 text-xs font-semibold text-[color:var(--fleet-accent)]">{roles[role].title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
