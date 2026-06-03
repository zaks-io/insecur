-- Instance bootstrap posture, identity configuration, operator claim, and secret verifier (PDF-01).

CREATE TABLE instance_configurations (
  instance_id text PRIMARY KEY REFERENCES instances (id),
  signup_lockdown_enabled boolean NOT NULL DEFAULT true,
  public_onboarding_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE instance_identity_configurations (
  instance_id text PRIMARY KEY REFERENCES instances (id),
  human_identity_provider text NOT NULL,
  workos_client_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instance_identity_configurations_provider_check
    CHECK (human_identity_provider IN ('workos_authkit'))
);

CREATE TABLE bootstrap_operator_claims (
  id text PRIMARY KEY,
  instance_id text NOT NULL REFERENCES instances (id),
  first_organization_id text NOT NULL REFERENCES organizations (id),
  status text NOT NULL,
  consumed_by_user_id text,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bootstrap_operator_claims_status_check
    CHECK (status IN ('pending', 'consumed'))
);

CREATE UNIQUE INDEX bootstrap_operator_claim_one_pending_per_instance
  ON bootstrap_operator_claims (instance_id)
  WHERE status = 'pending';

CREATE TABLE instance_operators (
  id text PRIMARY KEY,
  instance_id text NOT NULL REFERENCES instances (id),
  user_id text NOT NULL,
  grant_origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instance_operators_grant_origin_check
    CHECK (grant_origin IN ('bootstrap', 'admin'))
);

CREATE UNIQUE INDEX instance_operators_one_bootstrap_per_instance
  ON instance_operators (instance_id)
  WHERE grant_origin = 'bootstrap';

CREATE TABLE bootstrap_secret_verifiers (
  instance_id text PRIMARY KEY REFERENCES instances (id),
  secret_version integer NOT NULL DEFAULT 1,
  algorithm text NOT NULL,
  salt_b64 text NOT NULL,
  hash_b64 text NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bootstrap_secret_verifiers_algorithm_check
    CHECK (algorithm IN ('scrypt_v1'))
);
