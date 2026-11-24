"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { login, registerWorkspace } from "@/lib/auth-actions";

const field =
  "min-h-[3.3rem] w-full rounded-[var(--fleet-radius)] soft-inset border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] px-4 py-3 text-base text-[color:var(--fleet-text)] outline-none placeholder:text-[color:var(--fleet-muted)] hover:border-[var(--fleet-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";

export default function CustomerAuthForm({
  mode,
}: {
  mode: "login" | "register";
}) {
  const isLogin = mode === "login";
  const [showPassword, setShowPassword] = useState(false);
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [loginStatus, loginAction, loginPending] = useActionState(login, "");
  const [registration, registerAction, registerPending] = useActionState(registerWorkspace, null);
  const pending = isLogin ? loginPending : registerPending;
  const registered = !isLogin && registration?.ok === true;
  const message = isLogin ? loginStatus : registration?.ok === false ? registration.message : "";

  return (
    <div className="motion-safe:animate-[panel-enter_420ms_ease-out_both] mx-auto w-full max-w-[26rem] max-[720px]:max-w-[30rem]">
      <h1
        id="auth-title"
        className="m-0 text-[clamp(1.85rem,3vw,2.55rem)] font-bold leading-[1.25] tracking-[-.035em] text-[color:var(--fleet-text)]"
      >
        {isLogin ? "เข้าสู่ระบบพนักงาน" : "ขอเปิด Workspace"}
      </h1>
      {registered ? (
        <div className="mt-6 rounded-[var(--fleet-radius)] border border-[var(--fleet-line)] bg-[var(--fleet-surface)] p-5" role="status">
          <p className="font-semibold text-[color:var(--fleet-accent)]">ส่งคำขอแล้ว · รออนุมัติ</p>
          <p className="mt-2 break-words text-sm leading-relaxed text-[color:var(--fleet-muted)]">
            ได้รับคำขอของ {registration.companyName} แล้ว คุณจะเข้าสู่ระบบด้วยบัญชีผู้ดูแลได้เมื่อ Workspace เปิดใช้งาน
          </p>
        </div>
      ) : (
        <>
          <p className="mb-8 mt-3 text-base leading-relaxed text-[color:var(--fleet-muted)] max-[390px]:mb-6">
            {isLogin
              ? "ใช้อีเมลที่บริษัทเพิ่มไว้ ระบบจะพาคุณเข้า Workspace ของบริษัทโดยอัตโนมัติ"
              : "กรอกข้อมูลบริษัทและตั้งบัญชีผู้ดูแลคนแรกเพื่อส่งคำขออนุมัติ"}
          </p>
          <form
            className="grid gap-4"
            action={isLogin ? loginAction : registerAction}
            aria-busy={pending}
          >
            {!isLogin && (
              <>
                <div className="grid gap-2">
                  <label
                    className="text-sm font-medium text-[color:var(--fleet-text)]"
                    htmlFor="company"
                  >
                    ชื่อบริษัท
                  </label>
                  <input
                    className={field}
                    id="company"
                    name="company"
                    autoComplete="organization"
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    required
                    maxLength={150}
                    pattern={String.raw`.*\S.*`}
                  />
                </div>
                <div className="grid gap-2">
                  <label
                    className="text-sm font-medium text-[color:var(--fleet-text)]"
                    htmlFor="contact"
                  >
                    ชื่อผู้ดูแลบริษัท
                  </label>
                  <input
                    className={field}
                    id="contact"
                    name="contact"
                    autoComplete="name"
                    value={contact}
                    onChange={(event) => setContact(event.target.value)}
                    required
                    maxLength={100}
                    pattern={String.raw`.*\S.*`}
                  />
                </div>
              </>
            )}
            <div className="grid gap-2">
              <label
                className="text-sm font-medium text-[color:var(--fleet-text)]"
                htmlFor="email"
              >
                {isLogin ? "อีเมล" : "อีเมลผู้ดูแลบริษัท"}
              </label>
              <input
                className={field}
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@company.com"
                required
                maxLength={150}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label
                className="text-sm font-medium text-[color:var(--fleet-text)]"
                htmlFor="password"
              >
                {isLogin ? "รหัสผ่าน" : "ตั้งรหัสผ่าน"}
              </label>
              <div className="relative">
                <input
                  className={`${field} pr-[5.5rem]`}
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  minLength={isLogin ? undefined : 10}
                  maxLength={128}
                  aria-describedby={isLogin ? undefined : "register-password-hint"}
                  required
                />
                <button
                  className="absolute inset-y-1 right-1 grid min-h-11 min-w-18 cursor-pointer place-items-center rounded-2xl px-3 text-sm font-semibold text-[color:var(--fleet-accent)] hover:bg-[var(--fleet-selected)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--fleet-focus)]"
                  type="button"
                  aria-controls="password"
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "ซ่อน" : "แสดง"}
                </button>
              </div>
              {!isLogin && <p id="register-password-hint" className="text-xs text-[color:var(--fleet-muted)]">อย่างน้อย 10 อักขระ</p>}
            </div>
            <div role="status" className="empty:hidden rounded-xl border border-[var(--fleet-accent)]/20 bg-[var(--fleet-selected)] px-3.5 py-2.5 text-sm leading-relaxed text-[color:var(--fleet-accent)]">
              {pending ? "" : message}
            </div>
            <button
              className="mt-1 flex min-h-[3.35rem] items-center justify-between rounded-[var(--fleet-radius)] soft-control bg-[var(--fleet-signal)] px-5 text-base font-semibold text-[color:var(--fleet-on-signal)] motion-safe:transition-transform motion-safe:duration-200 hover:bg-[var(--fleet-signal-hover)] active:soft-inset motion-safe:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--fleet-focus)] disabled:cursor-wait disabled:opacity-70"
              type="submit"
              disabled={pending}
            >
              <span>{isLogin ? (pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ") : (pending ? "กำลังส่งคำขอ…" : "ส่งคำขอเปิด Workspace")}</span>
              <svg
                aria-hidden="true"
                className="size-5 shrink-0"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 15 15 5m-7 0h7v7" />
              </svg>
            </button>
          </form>
        </>
      )}
      {isLogin ? (
        <div className="mt-6 border-t border-[var(--fleet-line)] pt-3 text-sm text-[color:var(--fleet-muted)]">
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
            <span>เจ้าของบริษัท</span>
            <span><span className="font-semibold text-[color:var(--fleet-text)]">จัดการ Workspace</span> · เร็ว ๆ นี้</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <span>บริษัทใหม่</span>
            <Link href="/register" className="inline-flex min-h-11 items-center rounded-md font-bold text-[color:var(--fleet-accent)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]">
              ขอเปิด Workspace
            </Link>
          </div>
        </div>
      ) : (
        <p className="mt-6 border-t border-[var(--fleet-line)] pt-5 text-[13px] leading-relaxed text-[color:var(--fleet-muted)]">
          {!registered && "มี Workspace อยู่แล้ว? "}
          <Link className="font-bold text-[color:var(--fleet-accent)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--fleet-focus)]" href="/login">
            {registered ? "กลับไปหน้าเข้าสู่ระบบ" : "เข้าสู่ระบบพนักงาน"}
          </Link>
        </p>
      )}
    </div>
  );
}
