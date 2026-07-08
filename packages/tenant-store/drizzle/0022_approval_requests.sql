CREATE TABLE "approval_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requester_user_id" text,
	"requester_machine_identity_id" text,
	"operation_id" text,
	"impact_review_fingerprint" text,
	"comment_length" integer,
	"comment_sha256" text,
	"rollback_secret_id" text,
	"rollback_to_version_number" integer,
	"rollback_promote_requested" boolean DEFAULT false NOT NULL,
	"superseded_by_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_requests_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "approval_requests_status_check" CHECK ("approval_requests"."status" IN ('pending', 'approved_applied', 'rejected', 'canceled', 'superseded', 'policy_stale', 'requester_access_stale', 'target_closed', 'draft_discard_closed')),
	CONSTRAINT "approval_requests_purpose_check" CHECK ("approval_requests"."purpose" IN ('protected_promotion', 'protected_rollback')),
	CONSTRAINT "approval_requests_requester_present_check" CHECK (num_nonnulls("approval_requests"."requester_user_id", "approval_requests"."requester_machine_identity_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "promotion_change_set_draft_versions" (
	"org_id" text NOT NULL,
	"approval_request_id" text NOT NULL,
	"secret_id" text NOT NULL,
	"secret_version_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_draft_versions_pk" PRIMARY KEY("org_id","approval_request_id","secret_version_id")
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_project_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_environment_fk" FOREIGN KEY ("org_id","environment_id") REFERENCES "public"."environments"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_change_set_draft_versions" ADD CONSTRAINT "promotion_change_set_draft_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_change_set_draft_versions" ADD CONSTRAINT "promotion_draft_versions_request_fk" FOREIGN KEY ("org_id","approval_request_id") REFERENCES "public"."approval_requests"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_change_set_draft_versions" ADD CONSTRAINT "promotion_draft_versions_secret_fk" FOREIGN KEY ("org_id","secret_id") REFERENCES "public"."secrets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_change_set_draft_versions" ADD CONSTRAINT "promotion_draft_versions_secret_version_fk" FOREIGN KEY ("org_id","secret_id","secret_version_id") REFERENCES "public"."secret_versions"("org_id","secret_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_one_pending_promotion_idx" ON "approval_requests" USING btree ("org_id","environment_id") WHERE status = 'pending' AND purpose = 'protected_promotion';--> statement-breakpoint
CREATE INDEX "approval_requests_env_status_idx" ON "approval_requests" USING btree ("org_id","environment_id","status");