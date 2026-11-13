import { Elysia } from "elysia";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const ok = <T>(data: T, message = "OK") => ({ success: true as const, data, message });

// The gateway sets x-forwarded-for from the socket address; the auth-service port is only bound to localhost.
const clientIp = (request: Request, server: { requestIP(r: Request): { address: string } | null } | null) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || server?.requestIP(request)?.address || null;

export const http = new Elysia({ name: "http" })
  .derive({ as: "global" }, ({ request, server }) => ({
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    ip: clientIp(request, server),
    userAgent: request.headers.get("user-agent")?.slice(0, 255) ?? null,
  }))
  .onAfterHandle({ as: "global" }, ({ responseValue, requestId }) => {
    if (responseValue && typeof responseValue === "object" && "success" in responseValue) {
      return { ...responseValue, request_id: requestId };
    }
  })
  .onError({ as: "global" }, ({ code, error, set, requestId }) => {
    let status = 500;
    let errCode = "INTERNAL_ERROR";
    let message = "Internal server error";
    let details: unknown;

    if (error instanceof ApiError) {
      ({ status, code: errCode, message } = error);
    } else if (code === "VALIDATION") {
      status = 422;
      errCode = "VALIDATION_ERROR";
      message = "Request validation failed";
      details = error.all.map((e) => ({ field: e.path, message: e.summary ?? e.message }));
    } else if (code === "PARSE") {
      status = 400;
      errCode = "BAD_REQUEST";
      message = "Malformed request body";
    } else if (code === "NOT_FOUND") {
      status = 404;
      errCode = "NOT_FOUND";
      message = "Not found";
    } else if ((error as { errno?: string }).errno === "23505") {
      status = 409;
      errCode = "CONFLICT";
      message = "Resource already exists";
    } else if ((error as { errno?: string }).errno === "23503") {
      status = 409;
      errCode = "CONFLICT";
      message = "Resource is referenced or its relationship is invalid";
    } else {
      // message only: never log request bodies (passwords) or tokens
      console.error(`[${requestId}]`, error instanceof Error ? error.message : "unknown error");
    }
    set.status = status;
    return { success: false, error: { code: errCode, message, details }, request_id: requestId };
  });
