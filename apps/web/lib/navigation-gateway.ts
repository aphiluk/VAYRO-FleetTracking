import "server-only";

import { cookies } from "next/headers";

export async function proxyNavigation(request: Request, action: "search" | "route") {
  const fail = (status: number, code: string) => Response.json(
    { success: false, error: { code, message: "Navigation request could not be completed" } },
    { status, headers: { "cache-control": "no-store" } },
  );
  const token = (await cookies()).get("vayro_at")?.value;
  if (!token) return fail(401, "UNAUTHORIZED");

  const incoming = new URL(request.url);
  const origin = request.headers.get("origin");
  if (action === "route" && origin) {
    try {
      const source = new URL(origin);
      // Next.js can use an internal hostname in request.url. Compare the browser's Origin to the actual Host header.
      if (!["http:", "https:"].includes(source.protocol) || source.host !== request.headers.get("host")) {
        return fail(403, "FORBIDDEN");
      }
    } catch {
      return fail(403, "FORBIDDEN");
    }
  }

  try {
    const url = new URL(`/api/v1/navigation/${action}`, process.env.API_URL ?? "http://127.0.0.1:3001");
    const headers = new Headers({ authorization: `Bearer ${token}` });
    let body: string | undefined;
    if (action === "search") {
      const query = incoming.searchParams.get("q") ?? "";
      if (query.length > 200) return fail(422, "VALIDATION_ERROR");
      url.searchParams.set("q", query);
    } else {
      body = await request.text();
      if (body.length > 4096) return fail(413, "VALIDATION_ERROR");
      headers.set("content-type", "application/json");
    }
    const upstream = await fetch(url, {
      method: action === "search" ? "GET" : "POST",
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return fail(503, "NAVIGATION_UNAVAILABLE");
  }
}
