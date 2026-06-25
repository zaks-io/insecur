CREATE TABLE "user_admissions" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workos_user_id" text NOT NULL,
	"display_name" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "user_admissions_status_check" CHECK ("user_admissions"."status" IN ('active', 'revoked')),
	CONSTRAINT "user_admissions_revocation_check" CHECK (
		("user_admissions"."status" = 'active' AND "user_admissions"."revoked_at" IS NULL) OR
		("user_admissions"."status" = 'revoked' AND "user_admissions"."revoked_at" IS NOT NULL)
	)
);
--> statement-breakpoint
ALTER TABLE "user_admissions" ADD CONSTRAINT "user_admissions_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_admissions_one_workos_subject_per_instance" ON "user_admissions" USING btree ("instance_id","workos_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_admissions_one_user_per_instance" ON "user_admissions" USING btree ("instance_id","user_id");