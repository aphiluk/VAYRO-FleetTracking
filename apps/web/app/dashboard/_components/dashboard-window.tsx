"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useDashboardWindow } from "./admin-shell";

const focusRing =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";

type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export default function DashboardWindow({
  title,
  children,
  size = "default",
}: {
  title: string;
  children: ReactNode;
  size?: "default" | "large";
}) {
  const router = useRouter();
  const { minimized, minimize, focusLauncher } = useDashboardWindow();
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();
  const stage = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const position = useRef({ x: 0, y: 0 });
  const drag = useRef<Drag | null>(null);
  const dimensions = size === "large"
    ? expanded ? "h-[min(100%,54rem)] w-[min(100%,82rem)]" : "h-[min(100%,46rem)] w-[min(100%,68rem)]"
    : expanded ? "h-[min(100%,44rem)] w-[min(100%,65rem)]" : "h-[min(100%,34rem)] w-[min(100%,48rem)]";

  useEffect(() => {
    if (!minimized) panel.current?.focus({ preventScroll: true });
  }, [minimized]);

  useEffect(() => {
    window.addEventListener("resize", resetPosition);
    return () => window.removeEventListener("resize", resetPosition);
  }, []);

  function resetPosition() {
    drag.current = null;
    position.current = { x: 0, y: 0 };
    if (panel.current) panel.current.style.translate = "";
  }

  function close() {
    focusLauncher();
    router.replace("/dashboard", { scroll: false });
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (
      expanded ||
      event.button !== 0 ||
      event.pointerType === "touch" ||
      !stage.current ||
      !panel.current
    )
      return;

    const bounds = stage.current.getBoundingClientRect();
    const rect = panel.current.getBoundingClientRect();
    const { x, y } = position.current;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: x,
      offsetY: y,
      minX: x + bounds.left - rect.left,
      maxX: x + bounds.right - rect.right,
      minY: y + bounds.top - rect.top,
      maxY: y + bounds.bottom - rect.bottom,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || !panel.current)
      return;

    const x = Math.max(
      current.minX,
      Math.min(current.maxX, current.offsetX + event.clientX - current.startX),
    );
    const y = Math.max(
      current.minY,
      Math.min(current.maxY, current.offsetY + event.clientY - current.startY),
    );
    position.current = { x, y };
    panel.current.style.translate = `${x}px ${y}px`;
  }

  return (
    <div
      ref={stage}
      className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] grid place-items-center sm:inset-x-5"
    >
      <section
        ref={panel}
        role="dialog"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            close();
          }
        }}
        className={`pointer-events-auto flex min-h-0 flex-col overflow-hidden soft-window border border-[var(--fleet-line)] bg-[var(--fleet-surface)] outline-none motion-safe:animate-[panel-enter_220ms_ease-out] ${dimensions}`}
      >
        <header className="relative shrink-0 border-b border-[var(--fleet-line)] bg-[var(--fleet-surface)]">
          <div
            className={`select-none py-4 pl-29 pr-3 sm:px-29 sm:text-center ${expanded ? "" : "sm:cursor-grab sm:active:cursor-grabbing"}`}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
          >
            <h1 id={titleId} className="text-sm font-bold">
              {title}
            </h1>
          </div>
          <div className="absolute inset-y-0 left-1 flex items-center sm:left-2">
            <button
              type="button"
              aria-label="ปิดหน้าต่าง"
              title="ปิดหน้าต่าง"
              onClick={close}
              className={`group grid size-8 place-items-center rounded-md ${focusRing}`}
            >
              <span className="grid size-3.5 place-items-center rounded-full bg-[var(--fleet-signal)] text-[#49110c]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 12 12"
                  className="size-2.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="m3 3 6 6M9 3 3 9" />
                </svg>
              </span>
            </button>
            <button
              type="button"
              aria-label="ย่อหน้าต่าง"
              title="ย่อหน้าต่าง"
              onClick={minimize}
              className={`group grid size-8 place-items-center rounded-md ${focusRing}`}
            >
              <span className="grid size-3.5 place-items-center rounded-full bg-[#ffbf3f] text-[#4b3200]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 12 12"
                  className="size-2.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M3 6h6" />
                </svg>
              </span>
            </button>
            <button
              type="button"
              aria-label={expanded ? "คืนขนาดหน้าต่าง" : "ขยายหน้าต่าง"}
              title={expanded ? "คืนขนาดหน้าต่าง" : "ขยายหน้าต่าง"}
              onClick={() => {
                resetPosition();
                setExpanded(!expanded);
              }}
              className={`group grid size-8 place-items-center rounded-md ${focusRing}`}
            >
              <span className="grid size-3.5 place-items-center rounded-full bg-[#36cf59] text-[#073616]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 12 12"
                  className="size-2.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    d={expanded ? "M2 5h3V2m5 5H7v3" : "M5 2H2v3m5 5h3V7"}
                  />
                </svg>
              </span>
            </button>
          </div>
        </header>

        {children}
      </section>
    </div>
  );
}
