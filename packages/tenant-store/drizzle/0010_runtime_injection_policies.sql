CREATE TABLE "runtime_injection_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"display_name" text NOT NULL,
	"active_version_id" text,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runtime_injection_policies_environment_id_display_name_key" UNIQUE("environment_id","display_name"),
	CONSTRAINT "runtime_injection_policies_org_id_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "runtime_injection_policy_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"display_name_snapshot" text NOT NULL,
	"secret_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"variable_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"command" text NOT NULL,
	"command_fingerprint" text,
	"ttl_seconds" integer NOT NULL,
	"delivery_mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runtime_injection_policy_versions_policy_id_version_number_key" UNIQUE("policy_id","version_number"),
	CONSTRAINT "runtime_injection_policy_versions_org_id_policy_id_id_key" UNIQUE("org_id","policy_id","id")
);
--> statement-breakpoint
ALTER TABLE "runtime_injection_policies" ADD CONSTRAINT "runtime_injection_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_injection_policies" ADD CONSTRAINT "runtime_injection_policies_org_project_fkey" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_injection_policies" ADD CONSTRAINT "runtime_injection_policies_org_env_fkey" FOREIGN KEY ("org_id","environment_id") REFERENCES "public"."environments"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_injection_policy_versions" ADD CONSTRAINT "runtime_injection_policy_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_injection_policy_versions" ADD CONSTRAINT "rt_inj_pol_ver_org_policy_fkey" FOREIGN KEY ("org_id","policy_id") REFERENCES "public"."runtime_injection_policies"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_injection_policies" ADD CONSTRAINT "runtime_injection_policies_org_id_id_active_version_id_fkey" FOREIGN KEY ("org_id","id","active_version_id") REFERENCES "public"."runtime_injection_policy_versions"("org_id","policy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE runtime_injection_policies ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE runtime_injection_policies FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY runtime_injection_policies_tenant_isolation ON runtime_injection_policies
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));--> statement-breakpoint
ALTER TABLE runtime_injection_policy_versions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE runtime_injection_policy_versions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY runtime_injection_policy_versions_tenant_isolation ON runtime_injection_policy_versions
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));
