CREATE TABLE "machine_identity_environment_deploy_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"machine_identity_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"runtime_policy_key_ids" text[] NOT NULL,
	"credential_scopes" text[] NOT NULL,
	"secret_hash_algorithm" text NOT NULL,
	"secret_hash_salt_b64" text NOT NULL,
	"secret_hash_b64" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"non_expiring" boolean DEFAULT false NOT NULL,
	"rotation_interval_seconds" bigint,
	"rotation_reminder_interval_seconds" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machine_identity_environment_deploy_keys_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "machine_identity_environment_deploy_keys_environment_required" CHECK ("machine_identity_environment_deploy_keys"."environment_id" IS NOT NULL),
	CONSTRAINT "machine_identity_environment_deploy_keys_policy_keys_nonempty" CHECK (cardinality("machine_identity_environment_deploy_keys"."runtime_policy_key_ids") > 0),
	CONSTRAINT "machine_identity_environment_deploy_keys_scopes_nonempty" CHECK (cardinality("machine_identity_environment_deploy_keys"."credential_scopes") > 0),
	CONSTRAINT "machine_identity_environment_deploy_keys_status" CHECK ("machine_identity_environment_deploy_keys"."status" IN ('active', 'disabled')),
	CONSTRAINT "machine_identity_environment_deploy_keys_non_expiring_shape" CHECK (("machine_identity_environment_deploy_keys"."non_expiring" = false) OR ("machine_identity_environment_deploy_keys"."expires_at" IS NULL)),
	CONSTRAINT "machine_identity_environment_deploy_keys_expiring_shape" CHECK (("machine_identity_environment_deploy_keys"."non_expiring" = true) OR ("machine_identity_environment_deploy_keys"."expires_at" IS NOT NULL)),
	CONSTRAINT "machine_identity_environment_deploy_keys_rotation_interval_positive" CHECK ("machine_identity_environment_deploy_keys"."rotation_interval_seconds" IS NULL OR "machine_identity_environment_deploy_keys"."rotation_interval_seconds" > 0),
	CONSTRAINT "machine_identity_environment_deploy_keys_rotation_reminder_positive" CHECK ("machine_identity_environment_deploy_keys"."rotation_reminder_interval_seconds" IS NULL OR "machine_identity_environment_deploy_keys"."rotation_reminder_interval_seconds" > 0)
);
--> statement-breakpoint
ALTER TABLE "machine_identity_environment_deploy_keys" ADD CONSTRAINT "machine_identity_environment_deploy_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_identity_environment_deploy_keys" ADD CONSTRAINT "machine_identity_environment_deploy_keys_org_id_machine_identity_id_machine_identities_org_id_id_fk" FOREIGN KEY ("org_id","machine_identity_id") REFERENCES "public"."machine_identities"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_identity_environment_deploy_keys" ADD CONSTRAINT "machine_identity_environment_deploy_keys_org_id_project_id_projects_org_id_id_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_identity_environment_deploy_keys" ADD CONSTRAINT "machine_identity_environment_deploy_keys_org_id_environment_id_environments_org_id_id_fk" FOREIGN KEY ("org_id","environment_id") REFERENCES "public"."environments"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE machine_identity_environment_deploy_keys ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE machine_identity_environment_deploy_keys FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY machine_identity_environment_deploy_keys_tenant_isolation ON machine_identity_environment_deploy_keys
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));
