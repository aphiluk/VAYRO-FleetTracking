import { cookies } from "next/headers";

export async function GET(request: Request) {
  const failure = (status: number, code: string) => Response.json({ success: false, error: { code, message: "Dashboard data is unavailable" }, request_id: crypto.randomUUID() }, { status, headers: { "cache-control": "no-store" } });
  // Workspace scope is resolved by Reporting from Auth; the UI cannot choose another company.
  if (new URL(request.url).search) return failure(422, "VALIDATION_ERROR");
  const token = (await cookies()).get("vayro_at")?.value;
  if (!token) return failure(401, "UNAUTHORIZED");
  try {
    const response = await fetch(new URL("/api/v1/dashboard/company/summary", process.env.API_URL ?? "http://127.0.0.1:3001"), {
      headers: { authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
    });
    return new Response(response.body, { status: response.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch { return failure(503, "DASHBOARD_UNAVAILABLE"); }
}
