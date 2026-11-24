import { http, ok, type Caller } from "@vayro/service-kit";
import { Elysia } from "elysia";
import type { Directories } from "../../adapters/directories";
import { actionSchema, assignSchema, createSchema, paramsSchema, problemSchema, querySchema, updateSchema } from "./jobs.model";
import * as service from "./jobs.service";
export interface JobRouteOptions { resolveUser: (authorization: string | null | undefined) => Promise<Caller>; directories: Directories }
export const jobRoutes = ({ resolveUser, directories }: JobRouteOptions) => new Elysia({ normalize: false }).use(http)
  .derive(async ({ headers }) => ({ me: await resolveUser(headers.authorization) }))
  .get("/api/v1/jobs", async ({ me, query, ip }) => ok(await service.listJobs({ me, directories, ip }, query)), { query: querySchema })
  .get("/api/v1/driver/jobs", async ({ me, query, ip }) => ok(await service.listJobs({ me, directories, ip }, query, true)), { query: querySchema })
  .get("/api/v1/jobs/:id", async ({ me, params, ip }) => ok(await service.getJob({ me, directories, ip }, params.id)), { params: paramsSchema })
  .post("/api/v1/jobs", async ({ me, body, ip, set }) => { const row = await service.createJob({ me, directories, ip }, body); set.status = 201; return ok(row, "Transport job created"); }, { body: createSchema })
  .put("/api/v1/jobs/:id", async ({ me, params, body, ip }) => ok(await service.updateJob({ me, directories, ip }, params.id, body)), { params: paramsSchema, body: updateSchema })
  .patch("/api/v1/jobs/:id/assign", async ({ me, params, body, ip }) => ok(await service.updateJob({ me, directories, ip }, params.id, body, "assign")), { params: paramsSchema, body: assignSchema })
  .patch("/api/v1/jobs/:id/accept", async ({ me, params, ip }) => ok(await service.transition({ me, directories, ip }, params.id, "accept")), { params: paramsSchema, body: actionSchema })
  .patch("/api/v1/jobs/:id/start", async ({ me, params, ip }) => ok(await service.transition({ me, directories, ip }, params.id, "start")), { params: paramsSchema, body: actionSchema })
  .patch("/api/v1/jobs/:id/complete", async ({ me, params, ip }) => ok(await service.transition({ me, directories, ip }, params.id, "complete")), { params: paramsSchema, body: actionSchema })
  .patch("/api/v1/jobs/:id/problem", async ({ me, params, body, ip }) => ok(await service.transition({ me, directories, ip }, params.id, "problem", body.problem_note)), { params: paramsSchema, body: problemSchema })
  .patch("/api/v1/jobs/:id/cancel", async ({ me, params, ip }) => ok(await service.transition({ me, directories, ip }, params.id, "cancel")), { params: paramsSchema, body: actionSchema });
