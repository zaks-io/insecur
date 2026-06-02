-- Constrain invitation role presets to built-in V1 assignment identifiers (INS-126).

ALTER TABLE invitations
  ADD CONSTRAINT invitations_role_preset_check CHECK (
    role_preset IN ('owner', 'admin', 'developer', 'approval', 'read-only')
  );
