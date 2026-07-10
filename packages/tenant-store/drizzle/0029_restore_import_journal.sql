CREATE TABLE "restore_import_journal" (
	"only_row" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"instance_id" text NOT NULL,
	"artifact_ref" text NOT NULL,
	"source_export_operation_id" text NOT NULL,
	"source_export_timestamp" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"organization_count" integer,
	"manifest_organization_count" integer,
	"skipped_organization_count" integer,
	"imported_row_count" integer,
	CONSTRAINT "restore_import_journal_only_row_check" CHECK ("restore_import_journal"."only_row" = true),
	CONSTRAINT "restore_import_journal_status_check" CHECK ("restore_import_journal"."status" IN ('running', 'succeeded', 'failed'))
);
