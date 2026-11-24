import { useEffect, useRef, useState, type FormEvent } from "react";
import { chatTextLimit, chatTime, makeChatMessage, openDriverChatPreview, type ChatMessage, type ChatPacket, type ChatVehicle } from "@/lib/driver-chat-preview";
import { focus, Icon, muted, primaryButton, surface } from "./driver-ui";

type Thread = { vehicle: ChatVehicle; messages: ChatMessage[]; unread: number; example?: boolean };
const exampleVehicle = { id: "example", plate: "กท 2480" };

export function useDriverMessages(companyId: string | null, driverId: string) {
  const [threads, setThreads] = useState(new Map<string, Thread>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reading = useRef<string | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const connection = openDriverChatPreview(companyId, driverId, "dispatch", ({ vehicle, message }) => {
      const isReading = reading.current === vehicle.id;
      setThreads((previous) => {
        const thread = previous.get(vehicle.id);
        if (thread?.messages.some(({ id }) => id === message.id)) return previous;
        return new Map(previous).set(vehicle.id, {
          vehicle,
          messages: [...(thread?.messages ?? []), message],
          unread: isReading ? 0 : (thread?.unread ?? 0) + 1,
        });
      });
    });
    channel.current = connection;
    return () => {
      connection?.close();
      channel.current = null;
    };
  }, [companyId, driverId]);

  function openThread(id: string | null) {
    reading.current = id;
    setSelectedId(id);
    setThreads((previous) => {
      const thread = id === null ? undefined : previous.get(id);
      if (!id || !thread?.unread) return previous;
      return new Map(previous).set(id, { ...thread, unread: 0 });
    });
  }

  function openExample() {
    const message = makeChatMessage("dispatch", "เมื่อถึงจุดส่งแล้ว รบกวนจอดที่ประตู 2 แล้วแจ้งผมอีกครั้งครับ");
    setThreads((previous) => previous.has(exampleVehicle.id) ? previous : new Map(previous).set(exampleVehicle.id, {
      vehicle: exampleVehicle,
      messages: [message],
      unread: 0,
      example: true,
    }));
    openThread(exampleVehicle.id);
  }

  const selected = selectedId === null ? undefined : threads.get(selectedId);

  function reply(text: string) {
    if (!selected) return;
    const { vehicle } = selected;
    const message = makeChatMessage("driver", text);
    setThreads((previous) => {
      const current = previous.get(vehicle.id);
      return current ? new Map(previous).set(vehicle.id, { ...current, messages: [...current.messages, message] }) : previous;
    });
    if (!selected.example) channel.current?.postMessage({ vehicle, message } satisfies ChatPacket);
  }

  const inbox = Array.from(threads.values()).sort((a, b) => (b.messages.at(-1)?.at ?? 0) - (a.messages.at(-1)?.at ?? 0));
  const unread = inbox.reduce((total, thread) => total + thread.unread, 0);
  return { inbox, unread, selected, openThread, openExample, reply };
}

export default function DriverMessages({ chat }: { chat: ReturnType<typeof useDriverMessages> }) {
  if (chat.selected) return <Conversation key={chat.selected.vehicle.id} thread={chat.selected} onBack={() => chat.openThread(null)} onReply={chat.reply} />;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <header className="px-1">
        <h1 data-driver-heading tabIndex={-1} className="text-3xl font-bold">ข้อความ</h1>
        <p className={`mt-1 text-sm leading-relaxed ${muted}`}>ดูและตอบกลับข้อความจาก Dispatch</p>
      </header>
      <section aria-label="กล่องข้อความ" className={`${surface} overflow-hidden`}>
        {chat.inbox.length > 0 ? (
          <ul className="divide-y divide-[var(--fleet-line)]">
            {chat.inbox.map(({ vehicle, messages, unread, example }) => {
              const last = messages.at(-1);
              return (
                <li key={vehicle.id}>
                  <button type="button" onClick={() => chat.openThread(vehicle.id)} className={`flex min-h-[4.75rem] w-full items-center gap-3 px-3 py-3 text-left hover:bg-[var(--fleet-quiet)] focus-visible:-outline-offset-2 sm:px-5 ${focus}`}>
                    <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${unread ? "bg-[var(--fleet-selected)] text-[var(--fleet-accent)]" : `bg-[var(--fleet-quiet)] ${muted}`}`}><Icon name="chat" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold wrap-anywhere">Dispatch · {vehicle.plate}</span>
                      <span className={`mt-0.5 block truncate text-sm ${unread ? "font-semibold" : muted}`}>{example ? "ตัวอย่าง · " : ""}{last?.sender === "driver" ? "คุณ: " : ""}{last?.text}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {last && <time dateTime={new Date(last.at).toISOString()} className={`text-xs tabular-nums ${muted}`}>{chatTime.format(last.at)}</time>}
                      {unread > 0 && <UnreadCount count={unread} />}
                    </span>
                    <Icon name="chevron" className={`size-4 shrink-0 ${muted}`} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="grid min-h-56 justify-items-center content-center gap-2 px-5 py-8 text-center">
            <span className="mb-2 grid size-12 place-items-center rounded-xl bg-[var(--fleet-quiet)] text-[var(--fleet-muted)]"><Icon name="chat" className="size-6" /></span>
            <h2 className="font-bold">ยังไม่มีข้อความจาก Dispatch</h2>
            <p className={`max-w-xs text-sm leading-relaxed ${muted}`}>เมื่อ Dispatch ส่งแจ้งเตือนถึงรถของคุณ ข้อความจะปรากฏที่นี่</p>
            <button type="button" onClick={chat.openExample} className={`mt-1 min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--fleet-accent)] hover:bg-[var(--fleet-selected)] ${focus}`}>ลองข้อความตัวอย่าง</button>
          </div>
        )}
      </section>
      <p className={`px-1 text-xs leading-relaxed ${muted}`}>โหมดทดลอง · เปิด Dispatch และ Driver ในเบราว์เซอร์เดียวกันเพื่อทดสอบ ข้อความจะหายเมื่อรีเฟรช</p>
    </div>
  );
}

export function UnreadCount({ count }: { count: number }) {
  return <span aria-label={`${count} ข้อความใหม่`} className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--fleet-accent)] px-1 text-[10px] font-bold leading-none text-[var(--fleet-highlight)] tabular-nums">{count > 99 ? "99+" : count}</span>;
}

function Conversation({ thread, onBack, onReply }: { thread: Thread; onBack: () => void; onReply: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [thread.messages.length]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || text.length > chatTextLimit) return;
    onReply(text);
    setDraft("");
    input.current?.focus({ preventScroll: true });
  }

  return (
    <section aria-labelledby="driver-chat-title" className={`${surface} mx-auto flex h-[clamp(22rem,calc(100dvh-10.5rem),42rem)] w-full max-w-2xl flex-col overflow-hidden`}>
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--fleet-line)] px-3 py-3 sm:px-5">
        <button type="button" aria-label="กลับไปกล่องข้อความ" onClick={onBack} className={`grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--fleet-quiet)] hover:bg-[var(--fleet-selected)] ${focus}`}>
          <Icon name="arrow" className="size-5 rotate-180" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 id="driver-chat-title" ref={heading} data-driver-heading tabIndex={-1} className="text-lg font-bold">Dispatch</h1>
          <p className={`text-sm wrap-anywhere ${muted}`}>ทะเบียน {thread.vehicle.plate}</p>
        </div>
        <span className={`shrink-0 rounded-full bg-[var(--fleet-quiet)] px-2.5 py-1 text-xs ${muted}`}>{thread.example ? "ตัวอย่าง" : "แชตทดลอง"}</span>
      </header>
      <div ref={log} role="log" aria-label="บทสนทนากับ Dispatch" tabIndex={0} className={`min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[var(--fleet-quiet)] p-3 sm:p-5 ${focus} focus-visible:-outline-offset-2`}>
        {thread.messages.map(({ id, sender, text, at }) => {
          const mine = sender === "driver";
          return (
            <div key={id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] rounded-2xl border border-[var(--fleet-line)] px-3 py-2 sm:max-w-[78%] ${mine ? "rounded-tr-md bg-[var(--fleet-selected)]" : "rounded-tl-md bg-[var(--fleet-surface)]"}`}>
                <div className={`flex flex-wrap items-baseline gap-x-2 text-xs ${muted}`}>
                  <span className="font-semibold">{mine ? "คุณ" : "Dispatch"}</span>
                  <time dateTime={new Date(at).toISOString()} className="tabular-nums">{chatTime.format(at)}</time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed wrap-anywhere">{text}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={submit} className="flex shrink-0 items-end gap-2 border-t border-[var(--fleet-line)] p-3 sm:px-5">
        <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold">
          ตอบกลับ Dispatch
          <textarea ref={input} rows={2} maxLength={chatTextLimit} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="พิมพ์ข้อความ…" className={`min-h-12 resize-none rounded-xl border border-[var(--fleet-line)] bg-[var(--fleet-highlight)] px-3 py-2 text-base font-normal placeholder:text-[var(--fleet-muted)] ${focus}`} />
        </label>
        <button type="submit" disabled={!draft.trim()} className={`${primaryButton} shrink-0 px-3 sm:px-4`}><Icon name="send" className="size-4" />ส่ง</button>
      </form>
    </section>
  );
}
