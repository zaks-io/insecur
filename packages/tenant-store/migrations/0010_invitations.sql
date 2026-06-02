-- Pending membership invitations (PDF-02 / INS-48).

CREATE TABLE invitations (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  team_id text NOT NULL,
  invitee_user_id text NOT NULL,
  role_preset text NOT NULL,
  project_id text,
  status text NOT NULL DEFAULT 'pending',
  membership_id text,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_status_check CHECK (status IN ('pending', 'accepted', 'revoked')),
  CONSTRAINT invitations_org_team_fkey FOREIGN KEY (org_id, team_id) REFERENCES teams (org_id, id),
  CONSTRAINT invitations_org_project_fkey FOREIGN KEY (org_id, project_id) REFERENCES projects (org_id, id)
);

CREATE UNIQUE INDEX invitations_one_pending_per_invitee_org_project
  ON invitations (org_id, invitee_user_id, project_id)
  WHERE status = 'pending';

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY invitations_tenant_isolation ON invitations
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));
