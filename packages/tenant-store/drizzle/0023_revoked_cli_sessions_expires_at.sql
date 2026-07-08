ALTER TABLE "revoked_cli_sessions" ADD COLUMN "session_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "revoked_cli_sessions"
SET "session_expires_at" = "revoked_at" + interval '1 day'
WHERE "session_expires_at" IS NULL;--> statement-breakpoint
ALTER TABLE "revoked_cli_sessions" ALTER COLUMN "session_expires_at" SET NOT NULL;
