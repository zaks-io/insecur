CREATE TABLE "first_value_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"feedback_kind" text NOT NULL,
	"note" text NOT NULL,
	"grant_id" text,
	"operation_id" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "first_value_feedback" ADD CONSTRAINT "first_value_feedback_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE first_value_feedback ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE first_value_feedback FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY first_value_feedback_tenant_isolation ON first_value_feedback
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));
