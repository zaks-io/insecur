ALTER TABLE "secret_versions" ADD COLUMN "created_by_actor_type" text;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD COLUMN "created_by_machine_identity_id" text;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_created_by_actor_type_check" CHECK ("created_by_actor_type" IS NULL OR "created_by_actor_type" IN ('user', 'machine'));--> statement-breakpoint
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_created_by_actor_shape_check" CHECK (
  ("created_by_actor_type" = 'user' AND "created_by_user_id" IS NOT NULL AND "created_by_machine_identity_id" IS NULL)
  OR ("created_by_actor_type" = 'machine' AND "created_by_machine_identity_id" IS NOT NULL AND "created_by_user_id" IS NULL)
  OR ("created_by_actor_type" IS NULL AND "created_by_user_id" IS NULL AND "created_by_machine_identity_id" IS NULL)
);
