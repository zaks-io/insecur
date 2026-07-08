export const LOCAL_STORE_SCHEMA_VERSION = 3;

export const LOCAL_STORE_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS local_store_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS environments_project_id_id_idx
  ON environments(project_id, id);

CREATE TABLE IF NOT EXISTS secret_shapes (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  variable_key TEXT NOT NULL,
  secret_id TEXT NOT NULL,
  display_name TEXT,
  description TEXT,
  required INTEGER NOT NULL DEFAULT 0,
  generation_hint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, variable_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS secret_shapes_project_secret_id_idx
  ON secret_shapes(project_id, secret_id);

CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  variable_key TEXT NOT NULL,
  current_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, environment_id) REFERENCES environments(project_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS secrets_project_env_variable_key_idx
  ON secrets(project_id, environment_id, variable_key);

CREATE TABLE IF NOT EXISTS current_secret_versions (
  secret_id TEXT PRIMARY KEY NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  secret_version_id TEXT NOT NULL,
  organization_data_key_version INTEGER NOT NULL,
  project_data_key_version INTEGER NOT NULL,
  ciphertext BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_data_keys (
  organization_data_key_version INTEGER PRIMARY KEY NOT NULL,
  root_key_version INTEGER NOT NULL,
  wrapped_storage_ref TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_data_keys (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_data_key_version INTEGER NOT NULL,
  root_key_version INTEGER NOT NULL,
  wrapped_storage_ref TEXT NOT NULL,
  PRIMARY KEY (project_id, project_data_key_version)
);

CREATE TABLE IF NOT EXISTS injection_grants (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  variable_keys_json TEXT NOT NULL,
  secret_ids_json TEXT NOT NULL,
  secret_version_ids_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT,
  revoked_reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, environment_id) REFERENCES environments(project_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS local_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  event_code TEXT NOT NULL,
  outcome TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  environment_id TEXT,
  secret_id TEXT,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id, environment_id) REFERENCES environments(project_id, id) ON DELETE SET NULL
);
`;
