ALTER TABLE "injection_grants" ADD COLUMN "secret_version_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "injection_grants" ADD COLUMN "policy_id" text;--> statement-breakpoint
ALTER TABLE "injection_grants" ADD COLUMN "policy_version_id" text;--> statement-breakpoint
UPDATE "injection_grants"
SET "secret_version_ids" = ARRAY["secret_version_id"]
WHERE "secret_version_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "injection_grants" DROP COLUMN "secret_version_id";
