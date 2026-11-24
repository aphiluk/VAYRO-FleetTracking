import type { ReactNode } from "react";
import Link from "next/link";
import RouteVisual from "./route-visual";

export default function CustomerAuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh grid-cols-[minmax(0,1.04fr)_minmax(440px,0.96fr)] bg-[var(--fleet-page)] font-sans text-[color:var(--fleet-text)] max-[720px]:block">
      <aside
        className="relative isolate flex min-h-dvh flex-col justify-between overflow-hidden border-r border-[var(--fleet-line)] bg-[radial-gradient(ellipse_at_22%_12%,var(--fleet-highlight),#e5eaf1_78%)] p-[clamp(2rem,4.2vw,4.25rem)] text-[color:var(--fleet-text)] before:absolute before:-left-[22%] before:top-[14%] before:-z-10 before:aspect-square before:w-[78%] before:rounded-full before:border before:border-[var(--fleet-line)] before:shadow-[0_0_0_56px_#ffffff4d,0_0_0_112px_#ffffff26] max-[920px]:p-8 max-[720px]:hidden"
        aria-label="VAYRO Fleet Tracking"
      >
        <Link
          className="inline-flex w-fit items-center gap-3 text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--fleet-focus)]"
          href="/"
          aria-label="VAYRO Fleet Tracking หน้าหลัก"
        >
          <span
            className="relative grid size-10 rotate-[-35deg] place-items-center rounded-full border soft-control border-[var(--fleet-line)] bg-[var(--fleet-page)] before:size-5 before:rounded-[50%_50%_50%_0] before:border-2 before:border-[var(--fleet-accent)] before:content-[''] after:absolute after:size-1 after:rounded-full after:bg-[var(--fleet-accent)]"
            aria-hidden="true"
          />
          <span className="text-base font-extrabold tracking-[.16em]">
            VAYRO{" "}
            <small className="mt-0.5 block text-[9px] font-semibold tracking-[.18em] text-[color:var(--fleet-muted)]">
              FLEET OPERATIONS
            </small>
          </span>
        </Link>

        <div className="relative z-10 mt-[clamp(3rem,8vh,6rem)]">
          <p className="mb-5 flex items-center gap-2 text-[11px] font-bold tracking-[.13em] text-[color:var(--fleet-muted)]">
            <span className="size-1.5 rounded-full bg-[var(--fleet-signal)]" />{" "}
            CONTROL YOUR FLEET
          </p>
          <h2 className="m-0 text-[clamp(2.5rem,5vw,4rem)] font-bold leading-[1.17] tracking-[-.035em]">
            ทุกเส้นทาง
            <br />
            <em className="not-italic text-[color:var(--fleet-accent)]">
              อยู่ในมือคุณ
            </em>
          </h2>
          <p className="mt-5 text-base leading-[1.8] text-[color:var(--fleet-muted)]">
            รวมตำแหน่งรถและงานขนส่งของบริษัท
            <br />
            ไว้ในมุมมองเดียว
          </p>
        </div>

        <RouteVisual />

        <div className="flex justify-between font-mono text-[9px] font-semibold tracking-[.12em] text-[color:var(--fleet-muted)]">
          <span>
            VAYRO <b className="px-1 text-[color:var(--fleet-accent)]">·</b>{" "}
            FLEET TRACKING
          </span>
          <span className="flex items-center gap-2">
            THAILAND{" "}
            <i className="size-1.5 rounded-full bg-[var(--fleet-signal)]" />{" "}
            LIVE VIEW
          </span>
        </div>
      </aside>

      <section
        className="relative grid min-h-dvh content-center justify-items-center px-[clamp(2rem,6vw,6.5rem)] pb-[5.5rem] pt-16 max-[920px]:px-10 max-[720px]:min-h-dvh max-[720px]:content-start max-[720px]:justify-items-stretch max-[720px]:px-[1.4rem] max-[720px]:pb-20 max-[720px]:pt-5 max-[390px]:px-[1.1rem]"
        aria-labelledby="auth-title"
      >
        <div className="mb-8 hidden max-[720px]:block">
          <Link
            className="inline-flex w-fit items-center gap-3 text-[color:var(--fleet-text)] no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--fleet-focus)]"
            href="/"
            aria-label="VAYRO Fleet Tracking หน้าหลัก"
          >
            <span
              className="relative grid size-10 rotate-[-35deg] place-items-center rounded-full border soft-control border-[var(--fleet-line)] bg-[var(--fleet-page)] before:size-5 before:rounded-[50%_50%_50%_0] before:border-2 before:border-[var(--fleet-accent)] before:content-[''] after:absolute after:size-1 after:rounded-full after:bg-[var(--fleet-accent)]"
              aria-hidden="true"
            />
            <span className="text-base font-extrabold tracking-[.16em]">
              VAYRO{" "}
              <small className="mt-0.5 block text-[9px] font-semibold tracking-[.18em] text-[color:var(--fleet-muted)]">
                FLEET OPERATIONS
              </small>
            </span>
          </Link>
        </div>
        {children}
        <p className="absolute inset-x-6 bottom-6 m-0 text-center text-[11px] text-[color:var(--fleet-muted)] max-[720px]:inset-x-4 max-[720px]:bottom-4">
          การเข้าใช้งานแสดงว่าคุณยอมรับ{" "}
          <a
            className="font-semibold text-[color:var(--fleet-accent)] underline decoration-current underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--fleet-focus)]"
            href="mailto:privacy@vayro.example"
          >
            นโยบายความเป็นส่วนตัว
          </a>
        </p>
      </section>
    </main>
  );
}
