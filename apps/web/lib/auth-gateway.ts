import "server-only";

import { cookies } from "next/headers";
import type { ApiResponse, AuthenticatedUser, LoginRequest, LoginResponse, RegisterCompanyRequest, User } from "../../../packages/shared-types";

const accessCookie = "vayro_at";
const refreshCookie = "vayro_rt";
const serviceUnavailable = { ok: false, code: "AUTH_UNAVAILABLE" } as const;

async function requestGateway<T>(path: string, init?: RequestInit) {
  try {
    const baseUrl = process.env.API_URL ?? "http://127.0.0.1:3001";
    const response = await fetch(new URL(path, baseUrl), {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    const payload = (await response.json()) as ApiResponse<T>;
    if (response.ok && payload.success === true) return { ok: true, data: payload.data } as const;
    if (response.status < 500 && payload.success === false) {
      return { ok: false, code: payload.error.code } as const;
    }
  } catch {
    // Keep gateway errors and authentication data out of the browser response.
  }
  return serviceUnavailable;
}

function postJson(body: LoginRequest | RegisterCompanyRequest | { refresh_token: string }): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export async function registerCompany(input: RegisterCompanyRequest) {
  return requestGateway<{ workspace_status: "pending" }>("/api/v1/companies/register", postJson(input));
}

export function canUseEmployeeWorkspace(user: Pick<User, "company_id" | "role">) {
  return user.company_id !== null && (user.role === "company_admin" || user.role === "dispatcher");
}

export async function createEmployeeSession(credentials: LoginRequest) {
  const result = await requestGateway<LoginResponse>("/api/v1/auth/login", postJson(credentials));
  if (!result.ok) return result;

  const { access_token, refresh_token, expires_in, user } = result.data;
  const isDriver = user.role === "driver" && user.company_id !== null;
  if (!canUseEmployeeWorkspace(user) && !isDriver) {
    await requestGateway<null>("/api/v1/auth/logout", postJson({ refresh_token }));
    return { ok: false, code: "EMPLOYEE_ACCOUNT_REQUIRED" } as const;
  }

  const options = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE !== "false" &&
      (process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production"),
    path: "/",
    maxAge: expires_in,
  } as const;

  const store = await cookies();
  store.set(accessCookie, access_token, options);
  store.set(refreshCookie, refresh_token, options);
  return { ok: true, destination: isDriver ? "/driver" : "/dashboard" } as const;
}

export async function readSession() {
  const token = (await cookies()).get(accessCookie)?.value;
  if (!token) return { ok: false, code: "UNAUTHORIZED" } as const;
  return requestGateway<AuthenticatedUser>("/api/v1/auth/me", { headers: { authorization: `Bearer ${token}` } });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(refreshCookie)?.value;
  if (token) await requestGateway<null>("/api/v1/auth/logout", postJson({ refresh_token: token }));
  store.delete(accessCookie);
  store.delete(refreshCookie);
}
