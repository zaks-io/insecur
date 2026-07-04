ALTER TABLE "secret_versions" ADD COLUMN "lifecycle_state" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_lifecycle_state_check" CHECK ("lifecycle_state" IN ('draft', 'live', 'retained', 'discarded'));--> statement-breakpoint
UPDATE "secret_versions" AS sv
SET
  "lifecycle_state" = 'live',
  "published_at" = COALESCE(sv."published_at", sv."created_at")
FROM "secrets" AS s
WHERE s."current_version_id" = sv."id";--> statement-breakpoint
UPDATE "secret_versions" AS sv
SET "lifecycle_state" = 'retained'
FROM "secrets" AS s
WHERE sv."secret_id" = s."id"
  AND s."current_version_id" IS NOT NULL
  AND sv."id" <> s."current_version_id";--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "live_version_number" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "secrets" AS s
SET "live_version_number" = sv."version_number"
FROM "secret_versions" AS sv
WHERE s."current_version_id" = sv."id";
