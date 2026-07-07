CREATE TABLE "webhook_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"delivery_email" text,
	"enable_email_channel" boolean DEFAULT false NOT NULL,
	"enable_in_app_channel" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_subscriptions_status_check" CHECK ("webhook_subscriptions"."status" IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "webhook_subscription_event_types" (
	"org_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"event_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_subscription_event_types_org_id_subscription_id_event_code_pk" PRIMARY KEY("org_id","subscription_id","event_code"),
	CONSTRAINT "webhook_subscription_event_types_event_code_check" CHECK ("webhook_subscription_event_types"."event_code" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' AND char_length("webhook_subscription_event_types"."event_code") <= 128)
);
--> statement-breakpoint
CREATE TABLE "webhook_signing_secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"organization_data_key_version" integer NOT NULL,
	"ciphertext_storage_ref" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_signing_secrets_status_check" CHECK ("webhook_signing_secrets"."status" IN ('active', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "in_app_event_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"webhook_event_code" text NOT NULL,
	"envelope_payload" text NOT NULL,
	"signature" text NOT NULL,
	"signature_timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "in_app_event_notifications_webhook_event_code_check" CHECK ("in_app_event_notifications"."webhook_event_code" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' AND char_length("in_app_event_notifications"."webhook_event_code") <= 128)
);
--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webhook_subscription_event_types" ADD CONSTRAINT "webhook_subscription_event_types_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webhook_subscription_event_types" ADD CONSTRAINT "webhook_subscription_event_types_org_id_subscription_id_webhook_subscriptions_org_id_id_fk" FOREIGN KEY ("org_id","subscription_id") REFERENCES "public"."webhook_subscriptions"("org_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webhook_signing_secrets" ADD CONSTRAINT "webhook_signing_secrets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webhook_signing_secrets" ADD CONSTRAINT "webhook_signing_secrets_org_id_subscription_id_webhook_subscriptions_org_id_id_fk" FOREIGN KEY ("org_id","subscription_id") REFERENCES "public"."webhook_subscriptions"("org_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "in_app_event_notifications" ADD CONSTRAINT "in_app_event_notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "in_app_event_notifications" ADD CONSTRAINT "in_app_event_notifications_org_id_subscription_id_webhook_subscriptions_org_id_id_fk" FOREIGN KEY ("org_id","subscription_id") REFERENCES "public"."webhook_subscriptions"("org_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_org_id_id_key" UNIQUE("org_id","id");
--> statement-breakpoint
ALTER TABLE "webhook_signing_secrets" ADD CONSTRAINT "webhook_signing_secrets_org_id_id_key" UNIQUE("org_id","id");
--> statement-breakpoint
ALTER TABLE "in_app_event_notifications" ADD CONSTRAINT "in_app_event_notifications_org_id_id_key" UNIQUE("org_id","id");
