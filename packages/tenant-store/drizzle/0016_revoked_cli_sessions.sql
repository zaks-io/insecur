CREATE TABLE "revoked_cli_sessions" (
	"instance_id" text NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revoked_cli_sessions_instance_id_session_id_pk" PRIMARY KEY("instance_id","session_id")
);
--> statement-breakpoint
ALTER TABLE "revoked_cli_sessions" ADD CONSTRAINT "revoked_cli_sessions_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE no action ON UPDATE no action;
