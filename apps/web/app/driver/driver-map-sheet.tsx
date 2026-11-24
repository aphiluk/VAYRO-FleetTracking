import { useRef, type PointerEvent, type ReactNode } from "react";
import { focus, Icon, muted } from "./driver-ui";

type SheetDrag = {
  pointer: number;
  startY: number;
  startOffset: number;
  maxOffset: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  moved: boolean;
};

export default function DriverMapSheet({ expanded, onExpandedChange, summary, children }: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  summary: string;
  children: ReactNode;
}) {
  const sheet = useRef<HTMLElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const drag = useRef<SheetDrag | null>(null);
  const suppressClick = useRef(false);

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    const panel = sheet.current;
    if (!panel || !event.isPrimary || event.button !== 0) return;

    const bottom = panel.parentElement?.getBoundingClientRect().bottom ?? window.innerHeight;
    const startOffset = panel.getBoundingClientRect().bottom - bottom;
    drag.current = {
      pointer: event.pointerId,
      startY: event.clientY,
      startOffset,
      maxOffset: Math.max(0, panel.offsetHeight - event.currentTarget.offsetHeight),
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      moved: false,
    };
    suppressClick.current = false;
    panel.style.transition = "none";
    panel.style.transform = `translateY(${startOffset}px)`;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    const panel = sheet.current;
    if (!state || !panel || state.pointer !== event.pointerId) return;

    const delta = event.clientY - state.startY;
    if (!state.moved && Math.abs(delta) < 4) return;
    state.moved = true;
    const offset = state.startOffset + delta;
    const bounded = Math.max(0, Math.min(state.maxOffset, offset));
    panel.style.transform = `translateY(${bounded + (offset - bounded) * 0.18}px)`;
    const duration = event.timeStamp - state.lastTime;
    if (duration > 0) state.velocity = (event.clientY - state.lastY) / duration;
    state.lastY = event.clientY;
    state.lastTime = event.timeStamp;
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>, canceled = false) {
    const state = drag.current;
    const panel = sheet.current;
    if (!state || !panel || state.pointer !== event.pointerId) return;

    drag.current = null;
    panel.style.transition = "";
    panel.style.transform = "";
    if (!state.moved || canceled) return;

    suppressClick.current = true;
    const delta = event.clientY - state.startY;
    const velocity = event.timeStamp - state.lastTime < 100 ? state.velocity : 0;
    if (Math.abs(velocity) >= 0.5) onExpandedChange(velocity < 0);
    else if (Math.abs(delta) >= Math.min(78, state.maxOffset * 0.38)) onExpandedChange(delta < 0);
  }

  return (
    <div className="driver-map-sheet-anchor pointer-events-none absolute inset-x-0 bottom-0 z-30">
      <section ref={sheet} data-expanded={expanded} aria-label="แผงรายละเอียดงาน" className="driver-map-sheet pointer-events-auto mx-auto flex w-full max-w-xl flex-col border border-b-0 border-[var(--fleet-line)] bg-[var(--fleet-surface)]">
        <button
          ref={handle}
          type="button"
          aria-label={expanded ? "ย่อรายละเอียดงาน" : "เปิดรายละเอียดงาน"}
          aria-expanded={expanded}
          aria-controls="driver-trip-details"
          className={`driver-map-sheet-handle grid w-full shrink-0 cursor-grab grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-5 text-left active:cursor-grabbing ${focus}`}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={(event) => endDrag(event, true)}
          onLostPointerCapture={(event) => endDrag(event, true)}
          onClick={(event) => {
            if (event.detail !== 0 && suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            onExpandedChange(!expanded);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && expanded) onExpandedChange(false);
          }}
        >
          <span aria-hidden="true" className="driver-map-grab absolute top-2.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full" />
          <span className="min-w-0">
            <span className="block text-base font-bold">รายละเอียดงาน</span>
            <span className={`mt-0.5 block truncate text-xs ${muted}`}>{summary}</span>
          </span>
          <span aria-hidden="true" className="soft-inset grid size-10 place-items-center rounded-full bg-[var(--fleet-selected)] text-[var(--fleet-accent)]">
            <Icon name="chevron" className={`size-5 ${expanded ? "rotate-90" : "-rotate-90"}`} />
          </span>
        </button>
        <div
          id="driver-trip-details"
          inert={!expanded}
          aria-hidden={!expanded}
          className="driver-map-sheet-content min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain border-t border-[var(--fleet-line)] px-4 pt-4"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            handle.current?.focus({ preventScroll: true });
            onExpandedChange(false);
          }}
        >
          {children}
        </div>
      </section>
    </div>
  );
}
