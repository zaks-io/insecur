CREATE TABLE "secret_syncs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"app_connection_id" text NOT NULL,
	"display_name" text NOT NULL,
	"kind" text NOT NULL,
	"mapping_behavior" text DEFAULT 'managed' NOT NULL,
	"auto_sync_enabled" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"github_provider_scope" text,
	"target_repo_id" text,
	"target_github_environment_id" text,
	"created_by_user_id" text NOT NULL,
	"disabled_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secret_syncs_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "secret_syncs_environment_id_display_name_key" UNIQUE("environment_id","display_name"),
	CONSTRAINT "secret_syncs_kind_check" CHECK ("secret_syncs"."kind" IN ('github-actions', 'cloudflare-worker-secret')),
	CONSTRAINT "secret_syncs_mapping_behavior_check" CHECK ("secret_syncs"."mapping_behavior" IN ('managed', 'merge')),
	CONSTRAINT "secret_syncs_status_check" CHECK ("secret_syncs"."status" IN ('active', 'disabled', 'deleted')),
	CONSTRAINT "secret_syncs_github_provider_scope_check" CHECK ("secret_syncs"."github_provider_scope" IS NULL OR "secret_syncs"."github_provider_scope" IN ('environment', 'repository')),
	CONSTRAINT "secret_syncs_github_actions_target_check" CHECK ("secret_syncs"."kind" <> 'github-actions' OR ("secret_syncs"."target_repo_id" IS NOT NULL AND "secret_syncs"."github_provider_scope" IS NOT NULL AND ("secret_syncs"."github_provider_scope" = 'repository' OR "secret_syncs"."target_github_environment_id" IS NOT NULL))),
	CONSTRAINT "secret_syncs_cloudflare_target_check" CHECK ("secret_syncs"."kind" <> 'cloudflare-worker-secret' OR "secret_syncs"."target_repo_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "secret_sync_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"secret_sync_id" text NOT NULL,
	"secret_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secret_sync_bindings_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "secret_sync_bindings_sync_secret_key" UNIQUE("secret_sync_id","secret_id")
);
--> statement-breakpoint
ALTER TABLE "secret_syncs" ADD CONSTRAINT "secret_syncs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "secret_syncs" ADD CONSTRAINT "secret_syncs_org_project_fkey" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "secret_syncs" ADD CONSTRAINT "secret_syncs_org_environment_fkey" FOREIGN KEY ("org_id","environment_id") REFERENCES "public"."environments"("org_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "secret_syncs" ADD CONSTRAINT "secret_syncs_org_app_connection_fkey" FOREIGN KEY ("org_id","app_connection_id") REFERENCES "public"."app_connections"("org_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "secret_sync_bindings" ADD CONSTRAINT "secret_sync_bindings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "secret_sync_bindings" ADD CONSTRAINT "secret_sync_bindings_org_sync_fkey" FOREIGN KEY ("org_id","secret_sync_id") REFERENCES "public"."secret_syncs"("org_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "secret_sync_bindings" ADD CONSTRAINT "secret_sync_bindings_org_secret_fkey" FOREIGN KEY ("org_id","secret_id") REFERENCES "public"."secrets"("org_id","id") ON DELETE no action ON UPDATE no action;
