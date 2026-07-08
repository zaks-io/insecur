CREATE TABLE "protected_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"state" text NOT NULL,
	"purpose" text DEFAULT 'promotion' NOT NULL,
	"requester_user_id" text,
	"requester_machine_identity_id" text,
	"draft_version_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"impact_review_fingerprint" text,
	"execution_operation_id" text,
	"closure_reason_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "protected_changes_state_check" CHECK ("state" IN ('proposed', 'pending_approval', 'approved', 'rejected', 'stale', 'canceled', 'executing', 'succeeded', 'failed')),
	CONSTRAINT "protected_changes_purpose_check" CHECK ("purpose" IN ('promotion')),
	CONSTRAINT "protected_changes_requester_present_check" CHECK ("requester_user_id" IS NOT NULL OR "requester_machine_identity_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "protected_change_approval_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"protected_change_id" text NOT NULL,
	"approver_user_id" text NOT NULL,
	"audit_event_id" text NOT NULL,
	"operation_id" text,
	"impact_review_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "protected_changes" ADD CONSTRAINT "protected_changes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protected_changes" ADD CONSTRAINT "protected_changes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protected_changes" ADD CONSTRAINT "protected_changes_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protected_change_approval_evidence" ADD CONSTRAINT "protected_change_approval_evidence_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "protected_changes_org_id_id_key" ON "protected_changes" USING btree ("org_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "protected_changes_one_active_per_environment_idx" ON "protected_changes" USING btree ("org_id","environment_id") WHERE "state" IN ('proposed', 'pending_approval', 'approved', 'executing');--> statement-breakpoint
CREATE UNIQUE INDEX "protected_change_approval_evidence_org_change_key" ON "protected_change_approval_evidence" USING btree ("org_id","protected_change_id");--> statement-breakpoint
ALTER TABLE "protected_changes" ADD CONSTRAINT "protected_changes_org_id_project_id_projects_org_id_id_fk" FOREIGN KEY ("org_id","project_id") REFERENCES "public"."projects"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protected_changes" ADD CONSTRAINT "protected_changes_org_id_environment_id_environments_org_id_id_fk" FOREIGN KEY ("org_id","environment_id") REFERENCES "public"."environments"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protected_change_approval_evidence" ADD CONSTRAINT "protected_change_approval_evidence_org_id_protected_change_id_protected_changes_org_id_id_fk" FOREIGN KEY ("org_id","protected_change_id") REFERENCES "public"."protected_changes"("org_id","id") ON DELETE no action ON UPDATE no action;
