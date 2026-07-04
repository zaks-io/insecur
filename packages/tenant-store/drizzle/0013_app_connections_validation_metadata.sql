ALTER TABLE "app_connections" ADD COLUMN "last_validation_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_connections" ADD COLUMN "last_validation_outcome" text;--> statement-breakpoint
ALTER TABLE "app_connections" ADD COLUMN "last_validation_reason_code" text;--> statement-breakpoint
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_last_validation_outcome_check" CHECK ("app_connections"."last_validation_outcome" IS NULL OR "app_connections"."last_validation_outcome" IN ('success', 'failed'));
