import "server-only";
import { cookies } from "next/headers";

export async function proxyTransport(request: Request, segments: string[]) {
  const fail = (status: number, code: string) => Response.json({ success: false, error: { code, message: "Transport request could not be completed" }, request_id: crypto.randomUUID() }, { status, headers: { "cache-control": "no-store" } });
  const path = segments.join("/");
  if (!/^(jobs(\/[1-9]\d*(\/(assign|accept|start|complete|problem|cancel))?)?|driver\/jobs)$/.test(path)) return fail(404, "NOT_FOUND");
  const token = (await cookies()).get("vayro_at")?.value;
  if (!token) return fail(401, "UNAUTHORIZED");
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin) {
    try {
      const source = new URL(origin);
      if (!["https:", "http:"].includes(source.protocol) || source.host !== request.headers.get("host")) return fail(403, "FORBIDDEN");
    } catch { return fail(403, "FORBIDDEN"); }
  }
  try {
    const url = new URL(`/api/v1/${path}`, process.env.API_URL ?? "http://127.0.0.1:3001");
    const incoming = new URL(request.url);
    for (const name of ["limit", "offset", "q", "job_status"]) {
      const value = incoming.searchParams.get(name);
      if (value !== null) url.searchParams.set(name, value);
    }
    const body = request.method === "GET" ? undefined : await request.text();
    if (body && new TextEncoder().encode(body).byteLength > 2_097_152) return fail(413, "VALIDATION_ERROR");
    const response = await fetch(url, { method: request.method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body, cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]) });
    return new Response(response.body, { status: response.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch { return fail(503, "TRANSPORT_UNAVAILABLE"); }
}
