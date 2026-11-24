import { useRef, type PointerEvent } from "react";
import { focus, Icon } from "./driver-ui";

type FinishDrag = {
  pointer: number;
  startX: number;
  startOffset: number;
  travel: number;
  moved: boolean;
};

function thumbOffset(event: PointerEvent<HTMLButtonElement>, drag: FinishDrag) {
  return Math.max(0, Math.min(drag.travel, drag.startOffset + event.clientX - drag.startX));
}

export default function DriverFinishSlider({ onSlide, onConfirm, disabled = false }: { onSlide: () => void; onConfirm: () => void; disabled?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<FinishDrag | null>(null);
  const suppressClick = useRef(false);

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    const rail = track.current;
    if (disabled || !rail || !event.isPrimary || event.button !== 0) return;

    const thumb = event.currentTarget;
    const travel = Math.max(0, rail.clientWidth - thumb.offsetWidth - 2 * thumb.offsetLeft);
    const startOffset = Math.max(0, thumb.getBoundingClientRect().left - rail.getBoundingClientRect().left - rail.clientLeft - thumb.offsetLeft);
    drag.current = { pointer: event.pointerId, startX: event.clientX, startOffset, travel, moved: false };
    suppressClick.current = false;
    thumb.style.transition = "none";
    thumb.style.transform = `translateX(${startOffset}px)`;
    thumb.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (!current.moved && Math.abs(event.clientX - current.startX) < 4) return;
    current.moved = true;
    event.currentTarget.style.transform = `translateX(${thumbOffset(event, current)}px)`;
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>, canceled = false) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;

    event.currentTarget.style.transition = "";
    event.currentTarget.style.transform = "";
    suppressClick.current = current.moved || canceled;

    const endTolerance = Math.min(10, current.travel * 0.08);
    if (!disabled && !canceled && current.moved && current.travel > 0 && thumbOffset(event, current) >= current.travel - endTolerance) onSlide();
  }

  return (
    <div ref={track} className="driver-finish-slider pointer-events-auto relative flex min-h-[3.25rem] w-full select-none items-center justify-center rounded-full border border-[var(--fleet-line)] bg-[var(--fleet-selected)] px-14 text-center text-sm font-bold text-[var(--fleet-accent)]">
      <span aria-hidden="true">เลื่อนเพื่อจบงาน</span>
      <button
        type="button"
        aria-label="จบงาน"
        disabled={disabled}
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
          onConfirm();
        }}
        className={`driver-finish-thumb absolute top-1/2 left-[3px] grid size-11 -translate-y-1/2 cursor-grab place-items-center rounded-full bg-[var(--fleet-accent)] text-white active:cursor-grabbing ${focus}`}
      >
        <Icon name="arrow" className="size-5" />
      </button>
      <Icon name="check" className="pointer-events-none absolute right-4 size-4 opacity-60" />
    </div>
  );
}
