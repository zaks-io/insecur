CREATE TABLE "delivery_risk_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"preset_key" text NOT NULL,
	"preset_version" integer NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"selected_by_user_id" text NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_risk_policies_org_id_project_id_key" UNIQUE("org_id","project_id"),
	CONSTRAINT "delivery_risk_policies_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "delivery_risk_policies_preset_key_check" CHECK ("delivery_risk_policies"."preset_key" IN ('strict', 'balanced', 'automation_friendly')),
	CONSTRAINT "delivery_risk_policies_preset_version_check" CHECK ("delivery_risk_policies"."preset_version" >= 1),
	CONSTRAINT "delivery_risk_policies_policy_version_check" CHECK ("delivery_risk_policies"."policy_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "preview_automation_opt_ins" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"enabled_by_user_id" text NOT NULL,
	"enabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preview_automation_opt_ins_org_id_environment_id_key" UNIQUE("org_id","environment_id"),
	CONSTRAINT "preview_automation_opt_ins_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "preview_automation_opt_ins_revocation_pair_check" CHECK (("preview_automation_opt_ins"."revoked_at" IS NULL AND "preview_automation_opt_ins"."revoked_by_user_id" IS NULL) OR ("preview_automation_opt_ins"."revoked_at" IS NOT NULL AND "preview_automation_opt_ins"."revoked_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "delivery_risk_policies" ADD CONSTRAINT "delivery_risk_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_risk_policies" ADD CONSTRAINT "delivery_risk_policies_org_project_fkey" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_automation_opt_ins" ADD CONSTRAINT "preview_automation_opt_ins_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_automation_opt_ins" ADD CONSTRAINT "preview_automation_opt_ins_org_project_fkey" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_automation_opt_ins" ADD CONSTRAINT "preview_automation_opt_ins_org_env_fkey" FOREIGN KEY ("org_id","environment_id") REFERENCES "public"."environments"("org_id","id") ON DELETE no action ON UPDATE no action;