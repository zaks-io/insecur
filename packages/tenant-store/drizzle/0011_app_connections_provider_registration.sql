ALTER TABLE "app_connections" ADD COLUMN "connection_method" text;--> statement-breakpoint
ALTER TABLE "app_connections" ADD COLUMN "status" text DEFAULT 'pending_setup' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_connections" ADD COLUMN "setup_user_id" text;--> statement-breakpoint
ALTER TABLE "app_connections" ADD COLUMN "active_credential_id" text;--> statement-breakpoint
ALTER TABLE "app_connections" ADD COLUMN "status_reason_code" text;--> statement-breakpoint
ALTER TABLE "app_connections" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "app_connections" SET "connection_method" = "provider" WHERE "connection_method" IS NULL;--> statement-breakpoint
UPDATE "app_connections" SET "setup_user_id" = 'usr_00000000000000000000000000' WHERE "setup_user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "app_connections" ALTER COLUMN "connection_method" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app_connections" ALTER COLUMN "setup_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_connection_method_check" CHECK ("app_connections"."connection_method" IN ('github-app', 'scoped-api-token', 'vercel-integration-oauth'));--> statement-breakpoint
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_status_check" CHECK ("app_connections"."status" IN ('active', 'disconnected', 'reauthorization_required', 'pending_setup'));--> statement-breakpoint
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_org_id_active_credential_id_fkey" FOREIGN KEY ("org_id","active_credential_id") REFERENCES "public"."provider_credentials"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "provider_app_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"provider" text NOT NULL,
	"connection_method" text NOT NULL,
	"client_id" text NOT NULL,
	"callback_path" text NOT NULL,
	"status" text DEFAULT 'pending_setup' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_app_registrations_provider_check" CHECK ("provider_app_registrations"."provider" IN ('github', 'vercel')),
	CONSTRAINT "provider_app_registrations_connection_method_check" CHECK ("provider_app_registrations"."connection_method" IN ('github-app', 'vercel-integration-oauth')),
	CONSTRAINT "provider_app_registrations_status_check" CHECK ("provider_app_registrations"."status" IN ('configured', 'pending_setup'))
);
--> statement-breakpoint
ALTER TABLE "provider_app_registrations" ADD CONSTRAINT "provider_app_registrations_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_app_registrations_instance_provider_method_key" ON "provider_app_registrations" USING btree ("instance_id","provider","connection_method");
