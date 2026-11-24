"use client";

import { demoRoleLabels, useDemoRole } from "../_components/admin-shell";

const choices = [
  { role: "dispatch", description: "ติดตามรถบนแผนที่และดูงานขนส่ง" },
  {
    role: "admin",
    description: "ผู้ดูแลบริษัท ดูภาพรวมและเปิดหน้าจัดการรถกับคนขับ",
  },
] as const;

export default function TestRolePanel() {
  const { role, canPreview, selectRole } = useDemoRole();
  if (!canPreview) return null;

  return (
    <section
      id="test-role"
      aria-labelledby="test-role-heading"
      className="soft-card border border-[var(--fleet-line)] bg-[var(--fleet-surface)] p-4 sm:col-span-2 sm:p-5"
    >
      <h2 id="test-role-heading" className="font-semibold">
        TestRole
      </h2>
      <p className="mt-1 text-sm text-[color:var(--fleet-muted)]">
        เลือกมุมมองผู้ใช้บริการสำหรับทดลองด้วยข้อมูลจำลอง
      </p>
      <div
        role="group"
        aria-label="บทบาททดสอบ"
        className="mt-4 grid gap-2 sm:grid-cols-2"
      >
        {choices.map(({ role: option, description }) => {
          const active = role === option;
          return (
            <button
              key={option}
              type="button"
              aria-label={demoRoleLabels[option]}
              aria-describedby={`test-role-${option}`}
              aria-pressed={active}
              onClick={() => selectRole(option)}
              className={`flex items-start justify-between gap-2 rounded-xl border px-3.5 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)] disabled:opacity-60 ${active ? "soft-inset border-[var(--fleet-accent)] bg-[var(--fleet-selected)]" : "soft-control border-[var(--fleet-line)] bg-[var(--fleet-surface)] hover:bg-[var(--fleet-quiet)]"}`}
            >
              <span>
                <span className="block text-sm font-semibold">
                  {demoRoleLabels[option]}
                </span>
                <span
                  id={`test-role-${option}`}
                  className="mt-1 block text-xs leading-relaxed text-[color:var(--fleet-muted)]"
                >
                  {description}
                </span>
              </span>
              {active && (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="size-5 shrink-0 text-[color:var(--fleet-accent)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m4 10 4 4 8-8" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
