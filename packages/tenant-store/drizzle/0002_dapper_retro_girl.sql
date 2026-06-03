CREATE TABLE "app_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_connections_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "app_connections_provider_check" CHECK ("app_connections"."provider" ~ '^[a-z][a-z0-9_-]+$' AND char_length("app_connections"."provider") <= 64)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"event_code" text NOT NULL,
	"outcome" text NOT NULL,
	"result_code" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" text,
	"project_id" text,
	"environment_id" text,
	"resource_type" text,
	"resource_id" text,
	"related_resource_type" text,
	"related_resource_id" text,
	"details" jsonb,
	"request_id" text,
	"operation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bootstrap_operator_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"first_organization_id" text NOT NULL,
	"status" text NOT NULL,
	"consumed_by_user_id" text,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bootstrap_operator_claims_status_check" CHECK ("bootstrap_operator_claims"."status" IN ('pending', 'consumed'))
);
--> statement-breakpoint
CREATE TABLE "bootstrap_secret_verifiers" (
	"instance_id" text PRIMARY KEY NOT NULL,
	"secret_version" integer DEFAULT 1 NOT NULL,
	"algorithm" text NOT NULL,
	"salt_b64" text NOT NULL,
	"hash_b64" text NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bootstrap_secret_verifiers_algorithm_check" CHECK ("bootstrap_secret_verifiers"."algorithm" IN ('scrypt_v1'))
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"display_name" text NOT NULL,
	"is_protected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environments_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "injection_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"variable_keys" text[] NOT NULL,
	"secret_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"secret_version_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_configurations" (
	"instance_id" text PRIMARY KEY NOT NULL,
	"signup_lockdown_enabled" boolean DEFAULT true NOT NULL,
	"public_onboarding_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_identity_configurations" (
	"instance_id" text PRIMARY KEY NOT NULL,
	"human_identity_provider" text NOT NULL,
	"workos_client_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_identity_configurations_provider_check" CHECK ("instance_identity_configurations"."human_identity_provider" IN ('workos_authkit'))
);
--> statement-breakpoint
CREATE TABLE "instance_operators" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"user_id" text NOT NULL,
	"grant_origin" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_operators_grant_origin_check" CHECK ("instance_operators"."grant_origin" IN ('bootstrap', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "instances" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"team_id" text NOT NULL,
	"invitee_user_id" text NOT NULL,
	"role_preset" text NOT NULL,
	"project_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"membership_id" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_status_check" CHECK ("invitations"."status" IN ('pending', 'accepted', 'revoked')),
	CONSTRAINT "invitations_role_preset_check" CHECK ("invitations"."role_preset" IN ('owner', 'admin', 'developer', 'approval', 'read-only'))
);
--> statement-breakpoint
CREATE TABLE "machine_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machine_identities_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "machine_identity_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"machine_identity_id" text NOT NULL,
	"project_id" text NOT NULL,
	"authorization_scopes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machine_identity_memberships_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "machine_identity_memberships_org_id_machine_identity_id_project_id_key" UNIQUE("org_id","machine_identity_id","project_id"),
	CONSTRAINT "machine_identity_memberships_project_scoped" CHECK ("machine_identity_memberships"."project_id" IS NOT NULL),
	CONSTRAINT "machine_identity_memberships_scopes_nonempty" CHECK (cardinality("machine_identity_memberships"."authorization_scopes") > 0)
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"team_id" text,
	"user_id" text NOT NULL,
	"role_preset" text NOT NULL,
	"project_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"state" text NOT NULL,
	"intent_code" text NOT NULL,
	"idempotency_key" text,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_data_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"key_version" integer NOT NULL,
	"status" text NOT NULL,
	"root_key_version" integer DEFAULT 1 NOT NULL,
	"wrapped_storage_ref" text,
	"custody_evidence_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_data_keys_org_id_key_version_key" UNIQUE("org_id","key_version"),
	CONSTRAINT "organization_data_keys_status_check" CHECK ("organization_data_keys"."status" IN ('active', 'retired', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_instance_id_id_key" UNIQUE("instance_id","id")
);
--> statement-breakpoint
CREATE TABLE "project_data_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"key_version" integer NOT NULL,
	"status" text NOT NULL,
	"organization_data_key_version" integer DEFAULT 1 NOT NULL,
	"wrapped_storage_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_data_keys_project_id_key_version_key" UNIQUE("project_id","key_version"),
	CONSTRAINT "project_data_keys_status_check" CHECK ("project_data_keys"."status" IN ('active', 'retired', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"app_connection_id" text NOT NULL,
	"provider" text NOT NULL,
	"organization_data_key_version" integer NOT NULL,
	"ciphertext_storage_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_credentials_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "provider_credentials_provider_check" CHECK ("provider_credentials"."provider" ~ '^[a-z][a-z0-9_-]+$' AND char_length("provider_credentials"."provider") <= 64)
);
--> statement-breakpoint
CREATE TABLE "secret_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"secret_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"organization_data_key_version" integer,
	"project_data_key_version" integer,
	"ciphertext_storage_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secret_versions_secret_id_version_number_key" UNIQUE("secret_id","version_number"),
	CONSTRAINT "secret_versions_org_id_secret_id_id_key" UNIQUE("org_id","secret_id","id")
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"variable_key" text NOT NULL,
	"current_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secrets_environment_id_variable_key_key" UNIQUE("environment_id","variable_key"),
	CONSTRAINT "secrets_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "sensitive_metadata_fields" (
	"org_id" text NOT NULL,
	"scope_project_id" text DEFAULT '' NOT NULL,
	"metadata_type" text NOT NULL,
	"record_resource_id" text NOT NULL,
	"field_key" text NOT NULL,
	"organization_data_key_version" integer NOT NULL,
	"project_data_key_version" integer,
	"ciphertext_storage_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sensitive_metadata_fields_org_id_scope_project_id_metadata_type_record_resource_id_field_key_pk" PRIMARY KEY("org_id","scope_project_id","metadata_type","record_resource_id","field_key"),
	CONSTRAINT "sensitive_metadata_fields_metadata_type_check" CHECK ("sensitive_metadata_fields"."metadata_type" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' AND char_length("sensitive_metadata_fields"."metadata_type") <= 128),
	CONSTRAINT "sensitive_metadata_fields_field_key_check" CHECK ("sensitive_metadata_fields"."field_key" ~ '^[a-z][a-z0-9_]+$' AND char_length("sensitive_metadata_fields"."field_key") <= 64),
	CONSTRAINT "sensitive_metadata_fields_scope_project_id_check" CHECK ("sensitive_metadata_fields"."scope_project_id" = '' OR "sensitive_metadata_fields"."scope_project_id" ~ '^prj_[0-9A-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "sync_target_leases" (
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"provider_kind" text NOT NULL,
	"target_identity" text NOT NULL,
	"held_by_operation_id" text NOT NULL,
	"fencing_token" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_target_leases_org_id_project_id_provider_kind_target_identity_pk" PRIMARY KEY("org_id","project_id","provider_kind","target_identity"),
	CONSTRAINT "sync_target_leases_fencing_token_positive" CHECK ("sync_target_leases"."fencing_token" > 0)
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"display_name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootstrap_operator_claims" ADD CONSTRAINT "bootstrap_operator_claims_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootstrap_operator_claims" ADD CONSTRAINT "bootstrap_operator_claims_first_organization_id_organizations_id_fk" FOREIGN KEY ("first_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootstrap_operator_claims" ADD CONSTRAINT "bootstrap_operator_claims_instance_id_first_organization_id_fkey" FOREIGN KEY ("instance_id","first_organization_id") REFERENCES "public"."organizations"("instance_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootstrap_secret_verifiers" ADD CONSTRAINT "bootstrap_secret_verifiers_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_org_id_project_id_projects_org_id_id_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injection_grants" ADD CONSTRAINT "injection_grants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injection_grants" ADD CONSTRAINT "injection_grants_org_id_project_id_projects_org_id_id_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injection_grants" ADD CONSTRAINT "injection_grants_org_id_environment_id_environments_org_id_id_fk" FOREIGN KEY ("org_id","environment_id") REFERENCES "public"."environments"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance_configurations" ADD CONSTRAINT "instance_configurations_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance_identity_configurations" ADD CONSTRAINT "instance_identity_configurations_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance_operators" ADD CONSTRAINT "instance_operators_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_team_fkey" FOREIGN KEY ("org_id","team_id") REFERENCES "public"."teams"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_project_fkey" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_identities" ADD CONSTRAINT "machine_identities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_identity_memberships" ADD CONSTRAINT "machine_identity_memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_identity_memberships" ADD CONSTRAINT "machine_identity_memberships_org_id_machine_identity_id_machine_identities_org_id_id_fk" FOREIGN KEY ("org_id","machine_identity_id") REFERENCES "public"."machine_identities"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_identity_memberships" ADD CONSTRAINT "machine_identity_memberships_org_id_project_id_projects_org_id_id_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_team_id_teams_org_id_id_fk" FOREIGN KEY ("org_id","team_id") REFERENCES "public"."teams"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_project_id_projects_org_id_id_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_data_keys" ADD CONSTRAINT "organization_data_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_data_keys" ADD CONSTRAINT "project_data_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_data_keys" ADD CONSTRAINT "project_data_keys_org_id_project_id_projects_org_id_id_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_data_keys" ADD CONSTRAINT "project_data_keys_org_id_organization_data_key_version_organization_data_keys_org_id_key_version_fk" FOREIGN KEY ("org_id","organization_data_key_version") REFERENCES "public"."organization_data_keys"("org_id","key_version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_org_id_app_connection_id_app_connections_org_id_id_fk" FOREIGN KEY ("org_id","app_connection_id") REFERENCES "public"."app_connections"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_org_id_secret_id_secrets_org_id_id_fk" FOREIGN KEY ("org_id","secret_id") REFERENCES "public"."secrets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_org_id_project_id_projects_org_id_id_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_org_id_environment_id_environments_org_id_id_fk" FOREIGN KEY ("org_id","environment_id") REFERENCES "public"."environments"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_metadata_fields" ADD CONSTRAINT "sensitive_metadata_fields_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_target_leases" ADD CONSTRAINT "sync_target_leases_held_by_operation_id_operations_id_fk" FOREIGN KEY ("held_by_operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_target_leases" ADD CONSTRAINT "sync_target_leases_org_id_project_id_fkey" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bootstrap_operator_claim_one_pending_per_instance" ON "bootstrap_operator_claims" USING btree ("instance_id") WHERE "bootstrap_operator_claims"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "instance_operators_one_bootstrap_per_instance" ON "instance_operators" USING btree ("instance_id") WHERE "instance_operators"."grant_origin" = 'bootstrap';--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_one_pending_per_invitee_org_project" ON "invitations" USING btree ("org_id","invitee_user_id","project_id") WHERE "invitations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "operations_org_idempotency_key_idx" ON "operations" USING btree ("org_id","idempotency_key") WHERE "operations"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_data_keys_one_active_per_org" ON "organization_data_keys" USING btree ("org_id") WHERE "organization_data_keys"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "project_data_keys_one_active_per_project" ON "project_data_keys" USING btree ("org_id","project_id") WHERE "project_data_keys"."status" = 'active';--> statement-breakpoint
CREATE INDEX "sync_target_leases_held_by_operation_id_idx" ON "sync_target_leases" USING btree ("org_id","held_by_operation_id");--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_org_id_id_current_version_id_fkey" FOREIGN KEY ("org_id","id","current_version_id") REFERENCES "public"."secret_versions"("org_id","secret_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP INDEX IF EXISTS "invitations_one_pending_per_invitee_org_project";--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_one_pending_per_invitee_org_project" ON "invitations" USING btree ("org_id","invitee_user_id","project_id") NULLS NOT DISTINCT WHERE "invitations"."status" = 'pending';--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.tenant_visible(check_org_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN current_setting('app.service', true) = 'true' THEN true
    WHEN NULLIF(current_setting('app.current_org', true), '') IS NOT NULL
      THEN check_org_id = current_setting('app.current_org', true)
    ELSE false
  END;
$$;--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY organizations_tenant_isolation ON organizations
  FOR ALL
  USING (app.tenant_visible(id))
  WITH CHECK (app.tenant_visible(id));--> statement-breakpoint
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE projects FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY projects_tenant_isolation ON projects
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE environments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE environments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY environments_tenant_isolation ON environments
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE teams FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY teams_tenant_isolation ON teams
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY memberships_tenant_isolation ON memberships
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE organization_data_keys ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE organization_data_keys FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY organization_data_keys_tenant_isolation ON organization_data_keys
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE project_data_keys ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE project_data_keys FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY project_data_keys_tenant_isolation ON project_data_keys
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE secrets FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY secrets_tenant_isolation ON secrets
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE secret_versions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE secret_versions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY secret_versions_tenant_isolation ON secret_versions
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE injection_grants ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE injection_grants FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY injection_grants_tenant_isolation ON injection_grants
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY audit_events_tenant_isolation ON audit_events
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE operations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY operations_tenant_isolation ON operations
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY invitations_tenant_isolation ON invitations
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE sync_target_leases ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sync_target_leases FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY sync_target_leases_tenant_isolation ON sync_target_leases
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE machine_identities ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE machine_identities FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY machine_identities_tenant_isolation ON machine_identities
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE machine_identity_memberships ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE machine_identity_memberships FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY machine_identity_memberships_tenant_isolation ON machine_identity_memberships
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE app_connections ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app_connections FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY app_connections_tenant_isolation ON app_connections
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE provider_credentials ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE provider_credentials FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY provider_credentials_tenant_isolation ON provider_credentials
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE sensitive_metadata_fields ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sensitive_metadata_fields FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY sensitive_metadata_fields_tenant_isolation ON sensitive_metadata_fields
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.tenant_visible(text) TO PUBLIC;
