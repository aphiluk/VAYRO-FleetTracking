-- Additive migration: preserve existing jobs and history.
ALTER TYPE "job_status" ADD VALUE IF NOT EXISTS 'accepted';
ALTER TABLE "transport_jobs"
  ADD COLUMN "accepted_at" TIMESTAMPTZ(6),
  ADD COLUMN "cargo_description" TEXT,
  ADD COLUMN "route_snapshot" JSONB;
