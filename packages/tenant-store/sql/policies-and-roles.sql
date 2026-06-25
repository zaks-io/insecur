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
        'audit_events',
        'operations',
        'invitations',
        'sync_target_leases',
        'machine_identities',
        'machine_identity_memberships',
        'machine_identity_github_actions_oidc',
        'app_connections',
        'provider_credentials',
        'sensitive_metadata_fields'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA app TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.tenant_visible(text) TO PUBLIC;
