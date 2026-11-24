export type ChatSender = "dispatch" | "driver";
export type ChatMessage = { id: string; sender: ChatSender; text: string; at: number };
export type ChatVehicle = { id: string; plate: string };
export type ChatPacket = { vehicle: ChatVehicle; message: ChatMessage };

export const chatTextLimit = 1000;
export const chatTime = new Intl.DateTimeFormat("th-TH", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
});

export function makeChatMessage(sender: ChatSender, text: string): ChatMessage {
  const id = Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16)).join("-");
  return { id, sender, text, at: Date.now() };
}

function isChatPacket(value: unknown): value is ChatPacket {
  const packet = value as Partial<ChatPacket> | null;
  const vehicle = packet?.vehicle;
  const message = packet?.message;
  return typeof vehicle?.id === "string" && vehicle.id.length > 0 && vehicle.id.length <= 80 &&
    typeof vehicle.plate === "string" && vehicle.plate.length > 0 && vehicle.plate.length <= 160 &&
    typeof message?.id === "string" && message.id.length > 0 && message.id.length <= 80 &&
    (message.sender === "dispatch" || message.sender === "driver") &&
    typeof message.text === "string" && message.text.trim().length > 0 && message.text.length <= chatTextLimit &&
    Number.isFinite(message.at) && message.at > 0 && message.at <= 8.64e15;
}

export function openDriverChatPreview(
  companyId: string,
  driverId: string,
  from: ChatSender,
  receive: (packet: ChatPacket) => void,
) {
  if (typeof BroadcastChannel === "undefined") return null;
  const channel = new BroadcastChannel(`vayro:driver-chat-preview:${JSON.stringify([companyId, driverId])}`);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (isChatPacket(event.data) && event.data.message.sender === from) receive(event.data);
  };
  return channel;
}
