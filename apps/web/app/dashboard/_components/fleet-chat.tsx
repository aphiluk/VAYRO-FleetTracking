"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTransportJobs } from "@/lib/transport-client";
import { chatTextLimit, chatTime, makeChatMessage, openDriverChatPreview, type ChatMessage, type ChatSender, type ChatPacket } from "@/lib/driver-chat-preview";
import { getDemoFleet } from "../_data/fleet-demo";
import { chatThreadKey, demoChatTarget, vehicleChatTargets, type ChatTarget } from "../_data/vehicle-chat";
import { workspaceFleet } from "../_data/workspace-fleet";
import { useFleetVehicles } from "./fleet-vehicles";

type Source = "company" | "demo";
type ChatControls = { openInbox: () => void; openVehicle: (vehicleId: string, source?: Source) => void };

const Context = createContext<ChatControls | null>(null);
const demoTargets = getDemoFleet(0, 0).map(demoChatTarget);
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
const muted = "text-[color:var(--fleet-muted)]";
const button = `min-h-11 rounded-xl border border-[var(--fleet-line)] px-3 text-sm font-semibold hover:bg-[var(--fleet-quiet)] ${focus}`;
const field = `w-full rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-surface)] px-3 py-2 text-base sm:text-sm ${focus}`;

export function useFleetChat() {
  const controls = useContext(Context);
  if (!controls) throw new Error("Fleet chat requires FleetChatProvider");
  return controls;
}

export function VehicleChatButton({ vehicleId, demo = false }: { vehicleId: string; demo?: boolean }) {
  const { openVehicle } = useFleetChat();
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => openVehicle(vehicleId, demo ? "demo" : "company")}
      className={`${button} mt-3 flex w-full items-center justify-center gap-2 bg-[var(--fleet-selected)] text-[color:var(--fleet-accent)]`}
    >
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5h-2L5 21v-4.5A7.5 7.5 0 0 1 10.5 4h2a7.5 7.5 0 0 1 7.5 7.5Z" />
        <path d="M9 11.5h6" />
      </svg>
      ส่งแจ้งเตือน
    </button>
  );
}

export function FleetChatMenuButton({ className }: { className: string }) {
  const { openInbox } = useFleetChat();
  return (
    <button type="button" aria-haspopup="dialog" onClick={openInbox} className={className}>
      <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 6-3 6-3 8h18c0-2-3-2-3-8M10 20a2 2 0 0 0 4 0" />
      </svg>
      แจ้งเตือน
    </button>
  );
}

function Conversation({ target, messages, onSend }: {
  target: ChatTarget;
  messages: ChatMessage[];
  onSend: (message: ChatMessage) => void;
}) {
  const [sender, setSender] = useState<ChatSender>("dispatch");
  const [drafts, setDrafts] = useState({ dispatch: "", driver: "" });
  const draft = drafts[sender];
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!target.recipient || !text || text.length > chatTextLimit) return;
    onSend(makeChatMessage(sender, text));
    setDrafts((previous) => ({ ...previous, [sender]: "" }));
    input.current?.focus();
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--fleet-line)] px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold wrap-anywhere">{target.plate}</h3>
          <p className={`mt-0.5 text-xs wrap-anywhere ${muted}`}>{target.recipient ? `ผู้รับ: ${target.recipient.name}` : "ยังไม่มีคนขับที่รับข้อความ"}</p>
        </div>
        {target.recipient && (
          <div role="group" aria-label="ทดลองพิมพ์ในบทบาท" className="inline-flex rounded-xl bg-[var(--fleet-quiet)] p-0.5">
            {(["dispatch", "driver"] as const).map((role) => (
              <button
                key={role}
                type="button"
                aria-pressed={sender === role}
                onClick={() => setSender(role)}
                className={`min-h-10 rounded-lg px-2.5 text-xs font-bold ${focus} ${sender === role ? "bg-[var(--fleet-surface)] text-[color:var(--fleet-accent)]" : muted}`}
              >
                {role === "dispatch" ? "Dispatch" : "ทดลองเป็น Driver"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={log} role="log" aria-label="ข้อความในแชต" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[var(--fleet-quiet)] p-4">
        {!messages.length && (
          <div className="grid min-h-full place-items-center text-center">
            <div>
              <p className="text-sm font-semibold">{target.recipient ? "ยังไม่มีข้อความ" : "ยังส่งแจ้งเตือนให้รถคันนี้ไม่ได้"}</p>
              <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
                {target.recipient ? "พิมพ์ข้อความแรก แล้วสลับเป็น Driver เพื่อทดลองตอบกลับ" : "มอบหมายงานให้คนขับหรือกำหนดคนขับประจำรถก่อน"}
              </p>
            </div>
          </div>
        )}
        {messages.map(({ id, sender: author, text, at }) => (
          <div key={id} className={`flex ${author === sender ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] rounded-2xl px-3 py-2 ${author === sender ? "bg-[var(--fleet-selected)]" : "border border-[var(--fleet-line)] bg-[var(--fleet-surface)]"}`}>
              <div className={`flex flex-wrap items-baseline gap-x-3 text-[11px] ${muted}`}>
                <span className="font-semibold">{author === "dispatch" ? "Dispatch" : "Driver (จำลอง)"}</span>
                <time dateTime={new Date(at).toISOString()}>{chatTime.format(at)}</time>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed wrap-anywhere">{text}</p>
            </div>
          </div>
        ))}
      </div>
      {target.recipient && (
        <form onSubmit={submit} className="flex shrink-0 items-end gap-2 border-t border-[var(--fleet-line)] p-3">
          <label className="min-w-0 flex-1">
            <span className="sr-only">ข้อความแจ้งเตือน</span>
            <textarea
              ref={input}
              rows={2}
              maxLength={chatTextLimit}
              value={draft}
              onChange={(event) => {
                const value = event.target.value;
                setDrafts((previous) => ({ ...previous, [sender]: value }));
              }}
              placeholder={sender === "dispatch" ? "พิมพ์ข้อความถึงคนขับ…" : "พิมพ์ข้อความตอบ Dispatch…"}
              className={`${field} block max-h-32 min-h-11 resize-none`}
            />
          </label>
          <button type="submit" disabled={!draft.trim()} className={`min-h-11 shrink-0 rounded-xl bg-[var(--fleet-signal)] px-3 text-xs font-bold text-[color:var(--fleet-on-signal)] hover:bg-[var(--fleet-signal-hover)] disabled:opacity-50 sm:text-sm ${focus}`}>
            ส่งจำลอง
          </button>
        </form>
      )}
    </>
  );
}

export default function FleetChatProvider({ children, companyId }: { children: ReactNode; companyId: string | null }) {
  const { vehicles, types, drivers, loading, error } = useFleetVehicles();
  const { jobs } = useTransportJobs();
  const companyTargets = useMemo(
    () => vehicleChatTargets(workspaceFleet(vehicles, types, drivers, jobs), jobs),
    [vehicles, types, drivers, jobs],
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState<Source>("company");
  const [selection, setSelection] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const driverChannels = useRef(new Map<string, BroadcastChannel>());
  useEffect(() => {
    const channels = driverChannels.current;
    return () => { for (const channel of channels.values()) channel.close(); channels.clear(); };
  }, []);
  const targets = source === "company" ? companyTargets : demoTargets;
  const current = targets.find(({ vehicleId }) => selection === vehicleId);
  const currentKey = current ? chatThreadKey(source, current) : null;
  const search = query.trim().toLocaleLowerCase("th-TH");
  const rows = targets.map((target) => {
    const key = chatThreadKey(source, target);
    return { target, last: key ? threads[key]?.at(-1) : undefined };
  }).filter(({ target }) => [target.plate, target.code, target.recipient?.name ?? ""]
    .some((value) => value.toLocaleLowerCase("th-TH").includes(search)))
    .sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0));

  function open(sourceToShow: Source, vehicleId: string | null) {
    setSource(sourceToShow);
    setSelection(vehicleId);
    setQuery("");
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }

  function send(message: ChatMessage) {
    if (!currentKey || !current?.recipient) return;
    setThreads((previous) => ({ ...previous, [currentKey]: [...(previous[currentKey] ?? []), message] }));

    if (source !== "company" || message.sender !== "dispatch" || !companyId) return;
    const recipient = current.recipient;
    let channel = driverChannels.current.get(recipient.id);
    if (!channel) {
      const opened = openDriverChatPreview(companyId, recipient.id, "driver", (reply) => {
        const key = chatThreadKey("company", { vehicleId: reply.vehicle.id, recipient });
        if (!key) return;
        setThreads((previous) => {
          const history = previous[key];
          if (!history || history.some(({ id }) => id === reply.message.id)) return previous;
          return { ...previous, [key]: [...history, reply.message] };
        });
      });
      if (!opened) return;
      channel = opened;
      driverChannels.current.set(recipient.id, channel);
    }
    channel.postMessage({ vehicle: { id: current.vehicleId, plate: current.plate }, message } satisfies ChatPacket);
  }

  return (
    <Context.Provider value={{
      openInbox: () => open("company", null),
      openVehicle: (vehicleId, origin = "company") => open(origin, vehicleId),
    }}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="fleet-chat-title"
        aria-describedby="fleet-chat-note"
        className="soft-panel fixed inset-0 m-auto h-[min(39rem,calc(100dvh-1.5rem))] max-h-none w-[min(52rem,calc(100%-1.5rem))] max-w-none overflow-hidden border border-[var(--fleet-line)] bg-[var(--fleet-surface)] p-0 text-[color:var(--fleet-text)] backdrop:bg-[#182330]/50"
      >
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--fleet-line)] p-4">
            <div>
              <h2 id="fleet-chat-title" className="text-lg font-bold">แจ้งเตือนรถ</h2>
              <p id="fleet-chat-note" className={`mt-1 text-xs leading-relaxed ${muted}`}>แชตทดลอง · เปิดหน้า Driver ของผู้รับในเบราว์เซอร์เดียวกัน หรือสลับบทบาทเพื่อทดสอบ</p>
            </div>
            <button autoFocus type="button" aria-label="ปิดหน้าต่างแจ้งเตือน" onClick={() => dialog.current?.close()} className={`grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[var(--fleet-quiet)] ${focus}`}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[minmax(13rem,34%)_minmax(0,1fr)]">
            <aside aria-label="กล่องแจ้งเตือนทุกคัน" className={`min-h-0 flex-col border-[var(--fleet-line)] sm:flex sm:border-r ${current ? "hidden" : "flex"}`}>
              <div className="space-y-2 border-b border-[var(--fleet-line)] p-3">
                <div className="flex flex-wrap gap-x-3 gap-y-1" role="group" aria-label="กลุ่มรถในกล่องแจ้งเตือน">
                  {(["company", "demo"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={source === item}
                      onClick={() => { setSource(item); setSelection(null); setQuery(""); }}
                      className={`min-h-10 rounded-lg px-2 text-xs font-bold ${focus} ${source === item ? "bg-[var(--fleet-selected)] text-[color:var(--fleet-accent)]" : muted}`}
                    >
                      {item === "company" ? "รถทุกคัน" : "รถจำลอง"}
                    </button>
                  ))}
                </div>
                <input type="search" aria-label="ค้นหารถหรือคนขับในกล่องแจ้งเตือน" placeholder="ทะเบียนรถหรือชื่อคนขับ" value={query} onChange={(event) => setQuery(event.target.value)} className={field} />
              </div>
              <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2">
                {rows.map(({ target, last }) => (
                  <li key={target.vehicleId}>
                    <button
                      type="button"
                      aria-pressed={current?.vehicleId === target.vehicleId}
                      onClick={() => setSelection(target.vehicleId)}
                      className={`block min-h-14 w-full rounded-xl px-3 py-2 text-start ${focus} ${current?.vehicleId === target.vehicleId ? "bg-[var(--fleet-selected)]" : "hover:bg-[var(--fleet-quiet)]"}`}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 text-sm font-bold wrap-anywhere">{target.plate}</span>
                        {last && <span className={`shrink-0 text-[10px] ${muted}`}>{chatTime.format(last.at)}</span>}
                      </span>
                      <span className={`block truncate text-xs ${muted}`}>{target.recipient?.name ?? "ยังไม่มีคนขับ"}</span>
                      {last && <span className="mt-1 block truncate text-xs">{last.sender === "driver" ? "Driver: " : "Dispatch: "}{last.text}</span>}
                    </button>
                  </li>
                ))}
                {!rows.length && <li className={`p-3 text-sm ${muted}`}>
                  {source === "company" && loading ? "กำลังโหลดรายการรถ…" : source === "company" && error ? "โหลดรายการรถไม่ได้ กรุณากลับไปโหลดข้อมูลบริษัทใหม่" : search ? "ไม่พบรถที่ตรงกับคำค้น" : "ยังไม่มีรถใน Workspace นี้"}
                </li>}
              </ul>
            </aside>
            <section aria-label="บทสนทนา" className={`min-h-0 min-w-0 flex-col ${current ? "flex" : "hidden sm:flex"}`}>
              {current ? (
                <>
                  <button type="button" onClick={() => setSelection(null)} className={`${button} m-2 shrink-0 self-start sm:hidden`}>กลับไปรายการรถ</button>
                  <Conversation key={currentKey ?? `${source}:${current.vehicleId}`} target={current} messages={currentKey ? threads[currentKey] ?? [] : []} onSend={send} />
                </>
              ) : <div className={`grid flex-1 place-items-center p-6 text-center text-sm ${muted}`}>เลือกรถจากรายการเพื่อเปิดแชตแจ้งเตือน</div>}
            </section>
          </div>
        </div>
      </dialog>
    </Context.Provider>
  );
}
