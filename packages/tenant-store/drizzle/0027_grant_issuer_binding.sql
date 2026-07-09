-- Prelaunch reset: existing grants predate principal binding and are unsafe to retain.
DELETE FROM "injection_grants";--> statement-breakpoint
ALTER TABLE "injection_grants" ADD COLUMN "issued_actor_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "injection_grants" ADD COLUMN "issued_user_id" text;--> statement-breakpoint
ALTER TABLE "injection_grants" ADD COLUMN "issued_machine_identity_id" text;--> statement-breakpoint
ALTER TABLE "injection_grants" ADD COLUMN "issued_runtime_policy_key_id" text;--> statement-breakpoint
ALTER TABLE "injection_grants" ADD CONSTRAINT "injection_grants_issued_actor_type_check" CHECK ("issued_actor_type" IN ('user', 'machine'));--> statement-breakpoint
ALTER TABLE "injection_grants" ADD CONSTRAINT "injection_grants_issued_actor_shape_check" CHECK (
  ("issued_actor_type" = 'user' AND "issued_user_id" IS NOT NULL AND "issued_machine_identity_id" IS NULL AND "issued_runtime_policy_key_id" IS NULL)
  OR
  ("issued_actor_type" = 'machine' AND "issued_user_id" IS NULL AND "issued_machine_identity_id" IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "injection_grants" ADD CONSTRAINT "injection_grants_org_issued_machine_fkey" FOREIGN KEY ("org_id", "issued_machine_identity_id") REFERENCES "public"."machine_identities"("org_id", "id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injection_grants" ADD CONSTRAINT "injection_grants_org_issued_runtime_policy_fkey" FOREIGN KEY ("org_id", "issued_runtime_policy_key_id") REFERENCES "public"."runtime_injection_policies"("org_id", "id") ON DELETE no action ON UPDATE no action;
