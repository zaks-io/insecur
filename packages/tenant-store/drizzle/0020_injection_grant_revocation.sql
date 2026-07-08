ALTER TABLE "injection_grants" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "injection_grants" ADD COLUMN "revoked_reason" text;--> statement-breakpoint
ALTER TABLE "injection_grants" ADD CONSTRAINT "injection_grants_revoked_reason_check" CHECK ("revoked_reason" IS NULL OR "revoked_reason" IN ('tenant_suspension', 'compromise_version_invalidation'));
