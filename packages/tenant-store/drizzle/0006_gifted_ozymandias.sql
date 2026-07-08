CREATE TABLE "machine_identity_github_actions_oidc" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"machine_identity_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text,
	"github_repository" text NOT NULL,
	"github_environment" text,
	"oidc_audience" text NOT NULL,
	"credential_scopes" text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machine_identity_github_actions_oidc_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "machine_identity_github_actions_oidc_repository_lowercase" CHECK (lower("machine_identity_github_actions_oidc"."github_repository") = "machine_identity_github_actions_oidc"."github_repository"),
	CONSTRAINT "machine_identity_github_actions_oidc_scopes_nonempty" CHECK (cardinality("machine_identity_github_actions_oidc"."credential_scopes") > 0),
	CONSTRAINT "machine_identity_github_actions_oidc_status" CHECK ("machine_identity_github_actions_oidc"."status" IN ('active', 'disabled'))
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_machine_identity_id" text;--> statement-breakpoint
ALTER TABLE "machine_identity_github_actions_oidc" ADD CONSTRAINT "mi_gha_oidc_org_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_identity_github_actions_oidc" ADD CONSTRAINT "machine_identity_github_actions_oidc_org_machine_fkey" FOREIGN KEY ("org_id","machine_identity_id") REFERENCES "public"."machine_identities"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_identity_github_actions_oidc" ADD CONSTRAINT "machine_identity_github_actions_oidc_org_project_fkey" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_identity_github_actions_oidc" ADD CONSTRAINT "machine_identity_github_actions_oidc_org_env_fkey" FOREIGN KEY ("org_id","environment_id") REFERENCES "public"."environments"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE machine_identity_github_actions_oidc ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE machine_identity_github_actions_oidc FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY machine_identity_github_actions_oidc_tenant_isolation ON machine_identity_github_actions_oidc
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));