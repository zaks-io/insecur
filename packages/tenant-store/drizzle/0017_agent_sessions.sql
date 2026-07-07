CREATE TABLE "agent_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"human_session_id" text NOT NULL,
	"harness_name" text NOT NULL,
	"ancestry_key" text NOT NULL,
	"tier" text DEFAULT 'registered' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_active_ancestry" ON "agent_sessions" USING btree ("human_session_id","ancestry_key") WHERE "agent_sessions"."closed_at" IS NULL;
