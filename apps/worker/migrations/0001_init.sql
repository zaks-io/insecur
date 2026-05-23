-- Identities: humans (github login) and machines (bearer tokens)
CREATE TABLE identities (
  id           INTEGER PRIMARY KEY,
  type         TEXT NOT NULL CHECK (type IN ('human', 'machine')),
  name         TEXT NOT NULL,
  github_login TEXT UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tokens (
  id            INTEGER PRIMARY KEY,
  identity_id   INTEGER NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  hash          TEXT NOT NULL UNIQUE,
  scopes_json   TEXT NOT NULL,
  expires_at    TEXT,
  last_used_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at    TEXT
);
CREATE INDEX tokens_identity_idx ON tokens(identity_id);

CREATE TABLE projects (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE environments (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, slug)
);

CREATE TABLE secrets (
  id                 INTEGER PRIMARY KEY,
  project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  env_id             INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  current_version_id INTEGER,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (env_id, name)
);

CREATE TABLE secret_versions (
  id              INTEGER PRIMARY KEY,
  secret_id       INTEGER NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  n               INTEGER NOT NULL,
  ciphertext_b64  TEXT NOT NULL,
  dek_wrapped_b64 TEXT NOT NULL,
  ct_nonce_b64    TEXT NOT NULL,
  dek_nonce_b64   TEXT NOT NULL,
  comment         TEXT,
  created_by      INTEGER REFERENCES identities(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (secret_id, n)
);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL DEFAULT (datetime('now')),
  identity_id INTEGER REFERENCES identities(id),
  action      TEXT NOT NULL,
  scope       TEXT,
  target      TEXT,
  ip          TEXT,
  ua          TEXT,
  ok          INTEGER NOT NULL DEFAULT 1,
  meta_json   TEXT
);
CREATE INDEX audit_log_ts_idx ON audit_log(ts DESC);
CREATE INDEX audit_log_identity_idx ON audit_log(identity_id, ts DESC);
