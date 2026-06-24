/** Synthetic opaque IDs for RLS tests (metadata only). */
export const TEST_INSTANCE_ID = "inst_LOCAL_DEV";
export const TEST_ORG_A_ID = "org_00000000000000000000000001";
export const TEST_ORG_B_ID = "org_00000000000000000000000002";
export const TEST_PROJECT_A_ID = "prj_00000000000000000000000001";
export const TEST_PROJECT_B_ID = "prj_00000000000000000000000002";
export const TEST_TEAM_A_ID = "team_00000000000000000000000001";
export const TEST_TEAM_B_ID = "team_00000000000000000000000002";
export const TEST_MEM_A_ID = "mem_00000000000000000000000001";
export const TEST_MEM_B_ID = "mem_00000000000000000000000002";
export const TEST_MEM_CROSS_ORG_ID = "mem_00000000000000000000000099";
export const TEST_USER_ID = "usr_00000000000000000000000001";
/** WorkOS External Subject paired with TEST_USER_ID in baseline admission seed rows. */
export const TEST_WORKOS_USER_ID = "user_01workos_rls_baseline";
export const TEST_NO_SCOPE_USER_ID = "usr_00000000000000000000000NS1";
export const TEST_NO_SCOPE_WORKOS_USER_ID = "user_01workos_no_scope";
export const TEST_USER_ADMISSION_A_ID = "uad_00000000000000000000000001";
export const TEST_USER_ADMISSION_NS_ID = "uad_00000000000000000000000NS1";
export const TEST_ENV_A_ID = "env_00000000000000000000000001";
export const TEST_ENV_B_ID = "env_00000000000000000000000002";
export const TEST_SECRET_A_ID = "sec_00000000000000000000000001";
export const TEST_SECRET_B_ID = "sec_00000000000000000000000002";
export const TEST_VERSION_A_ID = "secv_00000000000000000000000001";
export const TEST_VERSION_B_ID = "secv_00000000000000000000000002";
export const TEST_ORG_KEY_A_ID = "odk_00000000000000000000000001";
export const TEST_ORG_KEY_B_ID = "odk_00000000000000000000000002";
export const TEST_PROJECT_KEY_A_ID = "pdk_00000000000000000000000001";
export const TEST_PROJECT_KEY_B_ID = "pdk_00000000000000000000000002";

/**
 * Tenant C is the dedicated first-use-mint sandbox. It is seeded WITHOUT data keys so suites can
 * exercise on-demand DEK minting against rows no other tenant reads. Never seed data keys for C and
 * never reuse it for RLS-isolation assertions, so a destructive mint here can never race a reader of
 * the shared A/B baseline tenants on the same local Postgres.
 */
export const TEST_ORG_C_ID = "org_00000000000000000000000003";
export const TEST_PROJECT_C_ID = "prj_00000000000000000000000003";
export const TEST_TEAM_C_ID = "team_00000000000000000000000003";
export const TEST_MEM_C_ID = "mem_00000000000000000000000003";
export const TEST_ENV_C_ID = "env_00000000000000000000000003";

/**
 * Tenants D and E are the dedicated data-key MUTATION sandboxes for the rewrap and readiness suites.
 * Those suites destructively change data-key root_key_version and status in place. The cross-package
 * `seedTenantBaseline()` deliberately never seeds D/E, so its concurrent `ON CONFLICT DO UPDATE`
 * re-seeds (run by `access`/`audit`/`operations` on the same local Postgres) can never flip a
 * mutation back mid-test. The mutating suites own D/E entirely: they seed active v1 keys in setup
 * and reset/clean them per test. Never seed D/E from `seedTenantBaseline`; never assert RLS
 * isolation across them from another suite.
 */
export const TEST_ORG_D_ID = "org_00000000000000000000000004";
export const TEST_PROJECT_D_ID = "prj_00000000000000000000000004";
export const TEST_TEAM_D_ID = "team_00000000000000000000000004";
export const TEST_MEM_D_ID = "mem_00000000000000000000000004";
export const TEST_ENV_D_ID = "env_00000000000000000000000004";
export const TEST_ORG_KEY_D_ID = "odk_00000000000000000000000004";
export const TEST_PROJECT_KEY_D_ID = "pdk_00000000000000000000000004";

export const TEST_ORG_E_ID = "org_00000000000000000000000005";
export const TEST_PROJECT_E_ID = "prj_00000000000000000000000005";
export const TEST_TEAM_E_ID = "team_00000000000000000000000005";
export const TEST_MEM_E_ID = "mem_00000000000000000000000005";
export const TEST_ENV_E_ID = "env_00000000000000000000000005";
export const TEST_ORG_KEY_E_ID = "odk_00000000000000000000000005";
export const TEST_PROJECT_KEY_E_ID = "pdk_00000000000000000000000005";
