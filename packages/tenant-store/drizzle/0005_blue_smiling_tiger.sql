ALTER TABLE "environments" ADD COLUMN "lifecycle_stage" text;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "preview_non_production_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "preview_non_production_confirmed_by_user_id" text;--> statement-breakpoint
UPDATE "environments"
SET "lifecycle_stage" = CASE
  WHEN "is_protected" THEN 'production'
  ELSE 'development'
END
WHERE "lifecycle_stage" IS NULL;--> statement-breakpoint
ALTER TABLE "environments" ALTER COLUMN "lifecycle_stage" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_lifecycle_stage_check" CHECK ("environments"."lifecycle_stage" IN ('development', 'preview', 'staging', 'production'));--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_development_non_protected_check" CHECK ("environments"."lifecycle_stage" <> 'development' OR "environments"."is_protected" = false);--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_staging_production_protected_check" CHECK ("environments"."lifecycle_stage" NOT IN ('staging', 'production') OR "environments"."is_protected" = true);--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_preview_opt_down_evidence_check" CHECK ("environments"."lifecycle_stage" <> 'preview' OR "environments"."is_protected" = true OR ("environments"."preview_non_production_confirmed_at" IS NOT NULL AND "environments"."preview_non_production_confirmed_by_user_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_preview_opt_down_fields_scope_check" CHECK (("environments"."preview_non_production_confirmed_at" IS NULL AND "environments"."preview_non_production_confirmed_by_user_id" IS NULL) OR "environments"."lifecycle_stage" = 'preview');
