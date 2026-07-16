-- ADR-0037 raw policy step (re-runnable, INS-158). Migration roles are provisioned by
-- infra/postgres/init (local) or the Neon host (CI); this file re-applies predicates and grants.

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.tenant_visible(check_org_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN current_setting('app.service', true) = 'true' THEN true
    WHEN NULLIF(current_setting('app.current_org', true), '') IS NOT NULL
      THEN check_org_id = current_setting('app.current_org', true)
    ELSE false
  END;
$$;

-- Lifecycle stage and protected posture are immutable after creation (PDF-04 / INS-152).
-- CHECK constraints keep posture consistent; this trigger blocks mutators from changing
-- lifecycle columns even when a future code path adds an UPDATE handler.
CREATE OR REPLACE FUNCTION app.enforce_environment_lifecycle_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lifecycle_stage IS DISTINCT FROM OLD.lifecycle_stage
     OR NEW.is_protected IS DISTINCT FROM OLD.is_protected
     OR NEW.preview_non_production_confirmed_at IS DISTINCT FROM OLD.preview_non_production_confirmed_at
     OR NEW.preview_non_production_confirmed_by_user_id IS DISTINCT FROM OLD.preview_non_production_confirmed_by_user_id
  THEN
    RAISE EXCEPTION 'lifecycle stage and protected posture cannot change after creation'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS environments_lifecycle_immutable ON environments;
CREATE TRIGGER environments_lifecycle_immutable
  BEFORE UPDATE ON environments
  FOR EACH ROW
  EXECUTE FUNCTION app.enforce_environment_lifecycle_immutable();

DROP POLICY IF EXISTS organizations_tenant_isolation ON organizations;
CREATE POLICY organizations_tenant_isolation ON organizations
  FOR ALL
  USING (app.tenant_visible(id))
  WITH CHECK (app.tenant_visible(id));

DROP POLICY IF EXISTS projects_tenant_isolation ON projects;
CREATE POLICY projects_tenant_isolation ON projects
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS environments_tenant_isolation ON environments;
CREATE POLICY environments_tenant_isolation ON environments
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS teams_tenant_isolation ON teams;
CREATE POLICY teams_tenant_isolation ON teams
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS memberships_tenant_isolation ON memberships;
CREATE POLICY memberships_tenant_isolation ON memberships
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS organization_data_keys_tenant_isolation ON organization_data_keys;
CREATE POLICY organization_data_keys_tenant_isolation ON organization_data_keys
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS project_data_keys_tenant_isolation ON project_data_keys;
CREATE POLICY project_data_keys_tenant_isolation ON project_data_keys
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS secrets_tenant_isolation ON secrets;
CREATE POLICY secrets_tenant_isolation ON secrets
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS secret_versions_tenant_isolation ON secret_versions;
CREATE POLICY secret_versions_tenant_isolation ON secret_versions
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS injection_grants_tenant_isolation ON injection_grants;
CREATE POLICY injection_grants_tenant_isolation ON injection_grants
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS runtime_injection_policies_tenant_isolation ON runtime_injection_policies;
CREATE POLICY runtime_injection_policies_tenant_isolation ON runtime_injection_policies
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS runtime_injection_policy_versions_tenant_isolation ON runtime_injection_policy_versions;
CREATE POLICY runtime_injection_policy_versions_tenant_isolation ON runtime_injection_policy_versions
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS audit_events_tenant_isolation ON audit_events;
CREATE POLICY audit_events_tenant_isolation ON audit_events
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS operations_tenant_isolation ON operations;
CREATE POLICY operations_tenant_isolation ON operations
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS invitations_tenant_isolation ON invitations;
CREATE POLICY invitations_tenant_isolation ON invitations
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS sync_target_leases_tenant_isolation ON sync_target_leases;
CREATE POLICY sync_target_leases_tenant_isolation ON sync_target_leases
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS machine_identities_tenant_isolation ON machine_identities;
CREATE POLICY machine_identities_tenant_isolation ON machine_identities
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS machine_identity_memberships_tenant_isolation ON machine_identity_memberships;
CREATE POLICY machine_identity_memberships_tenant_isolation ON machine_identity_memberships
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS machine_identity_github_actions_oidc_tenant_isolation ON machine_identity_github_actions_oidc;
CREATE POLICY machine_identity_github_actions_oidc_tenant_isolation ON machine_identity_github_actions_oidc
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS machine_identity_environment_deploy_keys_tenant_isolation ON machine_identity_environment_deploy_keys;
CREATE POLICY machine_identity_environment_deploy_keys_tenant_isolation ON machine_identity_environment_deploy_keys
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS app_connections_tenant_isolation ON app_connections;
CREATE POLICY app_connections_tenant_isolation ON app_connections
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS provider_credentials_tenant_isolation ON provider_credentials;
CREATE POLICY provider_credentials_tenant_isolation ON provider_credentials
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS webhook_subscriptions_tenant_isolation ON webhook_subscriptions;
CREATE POLICY webhook_subscriptions_tenant_isolation ON webhook_subscriptions
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS webhook_subscription_event_types_tenant_isolation ON webhook_subscription_event_types;
CREATE POLICY webhook_subscription_event_types_tenant_isolation ON webhook_subscription_event_types
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS webhook_signing_secrets_tenant_isolation ON webhook_signing_secrets;
CREATE POLICY webhook_signing_secrets_tenant_isolation ON webhook_signing_secrets
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS in_app_event_notifications_tenant_isolation ON in_app_event_notifications;
CREATE POLICY in_app_event_notifications_tenant_isolation ON in_app_event_notifications
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS secret_syncs_tenant_isolation ON secret_syncs;
CREATE POLICY secret_syncs_tenant_isolation ON secret_syncs
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS secret_sync_bindings_tenant_isolation ON secret_sync_bindings;
CREATE POLICY secret_sync_bindings_tenant_isolation ON secret_sync_bindings
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS protected_changes_tenant_isolation ON protected_changes;
CREATE POLICY protected_changes_tenant_isolation ON protected_changes
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS protected_change_approval_evidence_tenant_isolation ON protected_change_approval_evidence;
CREATE POLICY protected_change_approval_evidence_tenant_isolation ON protected_change_approval_evidence
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS approval_requests_tenant_isolation ON approval_requests;
CREATE POLICY approval_requests_tenant_isolation ON approval_requests
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS promotion_change_set_draft_versions_tenant_isolation ON promotion_change_set_draft_versions;
CREATE POLICY promotion_change_set_draft_versions_tenant_isolation ON promotion_change_set_draft_versions
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS first_value_feedback_tenant_isolation ON first_value_feedback;
CREATE POLICY first_value_feedback_tenant_isolation ON first_value_feedback
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DROP POLICY IF EXISTS sensitive_metadata_fields_tenant_isolation ON sensitive_metadata_fields;
CREATE POLICY sensitive_metadata_fields_tenant_isolation ON sensitive_metadata_fields
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOR tenant_table IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'organizations',
        'projects',
        'environments',
        'teams',
        'memberships',
        'organization_data_keys',
        'project_data_keys',
        'secrets',
        'secret_versions',
        'injection_grants',
        'runtime_injection_policies',
        'runtime_injection_policy_versions',
        'audit_events',
        'first_value_feedback',
        'operations',
        'invitations',
        'sync_target_leases',
        'machine_identities',
        'machine_identity_memberships',
        'machine_identity_github_actions_oidc',
        'machine_identity_environment_deploy_keys',
        'app_connections',
        'provider_credentials',
        'webhook_subscriptions',
        'webhook_subscription_event_types',
        'webhook_signing_secrets',
        'in_app_event_notifications',
        'secret_syncs',
        'secret_sync_bindings',
        'sensitive_metadata_fields',
        'protected_changes',
        'protected_change_approval_evidence',
        'approval_requests',
        'promotion_change_set_draft_versions'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
  END LOOP;
END
$$;

-- App schema function grants are applied by migrate.mjs to migration/runtime roles (INS-281).
-- Revoke legacy PUBLIC grants from the Drizzle 0002 baseline so only explicit roles retain access.
REVOKE USAGE ON SCHEMA app FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.tenant_visible(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.enforce_environment_lifecycle_immutable() FROM PUBLIC;

-- Restore-import ordering (ADR-0084, INS-565). The backup export registry orders tables so FK
-- parents import before children, but four constraints form cycles or forward references that no
-- single ordering can satisfy (secrets<->secret_versions, app_connections<->provider_credentials,
-- runtime_injection_policies<->runtime_injection_policy_versions, sync_target_leases->operations).
-- Marking them DEFERRABLE INITIALLY IMMEDIATE changes nothing for normal traffic (still checked per
-- statement) while letting the restore importer run SET CONSTRAINTS ALL DEFERRED inside each
-- atomic per-scope import transaction so the checks move to COMMIT. Re-runnable.
ALTER TABLE secrets
  ALTER CONSTRAINT secrets_org_id_id_current_version_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE app_connections
  ALTER CONSTRAINT app_connections_org_id_active_credential_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE runtime_injection_policies
  ALTER CONSTRAINT runtime_injection_policies_org_id_id_active_version_id_fkey
  DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE sync_target_leases
  ALTER CONSTRAINT sync_target_leases_held_by_operation_id_operations_id_fk
  DEFERRABLE INITIALLY IMMEDIATE;
