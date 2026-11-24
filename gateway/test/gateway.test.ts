import { expect, test } from "bun:test";
import { createGateway } from "../src/app";

test("forwards the existing API contract and only trusted headers", async () => {
  const upstream = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      return Response.json({
        path: new URL(request.url).pathname,
        query: new URL(request.url).search,
        method: request.method,
        body: await request.text(),
        authorization: request.headers.get("authorization"),
        contentType: request.headers.get("content-type"),
        internalToken: request.headers.get("x-internal-token"),
        requestId: request.headers.get("x-request-id"),
        clientIp: request.headers.get("x-forwarded-for"),
      }, { status: 201, headers: { "cache-control": "no-store", "x-internal-token": "private" } });
    },
  });

  try {
    const app = createGateway({ TRANSPORT_SERVICE_URL: upstream.url.origin });
    const body = '{ "job_code": "VT-1" }';
    const response = await app.handle(new Request("http://localhost/api/v1/jobs?limit=5", {
      method: "POST",
      body,
      headers: {
        "authorization": "Bearer example",
        "content-type": "application/json",
        "x-internal-token": "untrusted",
        "x-request-id": "untrusted",
        "x-forwarded-for": "203.0.113.9",
      },
    }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("x-internal-token")).toBe(false);
    expect(await response.json()).toEqual({
      path: "/api/v1/jobs",
      query: "?limit=5",
      method: "POST",
      body,
      authorization: "Bearer example",
      contentType: "application/json",
      internalToken: null,
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      clientIp: null,
    });
  } finally {
    upstream.stop(true);
  }
});

test("blocks private and unfinished routes and matches whole segments", async () => {
  const app = createGateway({});
  for (const path of [
    "/internal/introspect",
    "/api/v1/internal/introspect",
    "/api/v1/vehicles-other",
    "/api/v1/tracking/vehicles",
  ]) {
    expect((await app.handle(new Request(`http://localhost${path}`))).status).toBe(404);
  }
});

test("forwards report CSV downloads with their filename", async () => {
  const upstream = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      return new Response(new URL(request.url).pathname, {
        headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="jobs.csv"' },
      });
    },
  });
  try {
    const app = createGateway({ REPORTING_SERVICE_URL: upstream.url.origin });
    const response = await app.handle(new Request("http://localhost/api/v1/reports/jobs?format=csv"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="jobs.csv"');
    expect(await response.text()).toBe("/api/v1/reports/jobs");
  } finally {
    upstream.stop(true);
  }
});

test("maps a delayed upstream response to 504 and never retries a write", async () => {
  let requests = 0;
  const upstream = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch() {
      requests++;
      await Bun.sleep(500);
      return Response.json({ success: true });
    },
  });

  try {
    const app = createGateway({ GPS_DATA_SERVICE_URL: upstream.url.origin }, 100);
    const response = await app.handle(new Request("http://localhost/api/v1/gps/ingest", {
      method: "POST",
      body: "{}",
    }));
    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("UPSTREAM_TIMEOUT");
    expect(requests).toBe(1);
  } finally {
    upstream.stop(true);
  }
});

test("maps upstream redirects to 502 without forwarding the request again", async () => {
  let requests = 0;
  const upstream = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      requests++;
      return new Response(null, { status: 307, headers: { location: "/unexpected" } });
    },
  });

  try {
    const app = createGateway({ AUTH_SERVICE_URL: upstream.url.origin });
    const response = await app.handle(new Request("http://localhost/api/v1/auth/me"));
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(requests).toBe(1);
  } finally {
    upstream.stop(true);
  }
});
