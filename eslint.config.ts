import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

import {
  KEYRING_CONSTRUCTION_RESTRICTED_CRYPTO_IMPORTS,
  KEYRING_CONSTRUCTION_RESTRICTED_IMPORTS,
  KEYRING_CONSTRUCTION_SOURCE_MODULE_BASENAMES_REGEX,
  KEYRING_CONSTRUCTION_SOURCE_MODULE_PATTERNS,
  KEYRING_CONSTRUCTION_RESTRICTED_IMPORT_NAME_PATTERN,
  KEYRING_CONSTRUCTION_VALUE_IMPORT_ALLOWLIST,
} from "./packages/crypto/src/keyring-construction-boundary.js";

/** ADR-0071 decrypt-import allowlist of record. */
const DECRYPT_IMPORT_ALLOWLIST = [
  "packages/runtime-injection/src/decrypt-grant-secret.ts",
  "packages/backup-restore/src/recovery-canary.ts",
  "packages/app-connection/src/decrypt-provider-credential-for-validation.ts",
  "packages/app-connection/src/decrypt-cloudflare-connection-boundary-for-validation.ts",
] as const;

const DECRYPT_ENTRY_POINT_NAMES = [
  "decryptSecretValueForRuntime",
  "decryptProviderCredentialForProviderUse",
  "decryptSensitiveMetadataForAuthorizedRead",
] as const;

const DECRYPT_IMPORT_BOUNDARY_MESSAGE =
  "Decrypt entry points may only be imported from allowlisted egress modules (ADR-0071). Add an allowlist entry in eslint.config.ts.";

const decryptImportBoundaryOptions = {
  paths: [
    {
      name: "@insecur/crypto",
      importNames: [...DECRYPT_ENTRY_POINT_NAMES],
      message: DECRYPT_IMPORT_BOUNDARY_MESSAGE,
    },
  ],
  patterns: [
    {
      group: [
        "**/crypto/src/envelope",
        "**/crypto/src/envelope.js",
        "**/crypto/src/encryption",
        "**/crypto/src/encryption.js",
        "**/crypto/src/provider-credential-envelope",
        "**/crypto/src/provider-credential-envelope.js",
        "**/crypto/src/sensitive-metadata-envelope",
        "**/crypto/src/sensitive-metadata-envelope.js",
      ],
      importNamePattern:
        "^decrypt(SecretValueForRuntime|ProviderCredentialForProviderUse|SensitiveMetadataForAuthorizedRead)$",
      message: DECRYPT_IMPORT_BOUNDARY_MESSAGE,
    },
  ],
};

/**
 * INS-199 keyring-construction boundary (ADR-0064/0077). The root key may only be turned into a
 * keyring inside the Runtime Worker. Fencing the constructors here makes "no public route can build
 * a keyring" an author-time failure, not just a structural one (the absent binding is the other half).
 */
const KEYRING_BOUNDARY_MESSAGE =
  "Keyring construction is confined to apps/runtime/src/** (ADR-0064/0077). The public API Worker must reach the keyring only over the RUNTIME Service Binding.";

const keyringBoundaryOptions = {
  paths: [
    {
      name: "@insecur/crypto",
      importNames: [...KEYRING_CONSTRUCTION_RESTRICTED_CRYPTO_IMPORTS],
      allowTypeImports: true,
      message: KEYRING_BOUNDARY_MESSAGE,
    },
  ],
  patterns: [
    {
      group: ["**/crypto/keyring-context", "**/crypto/keyring-context.js"],
      message: KEYRING_BOUNDARY_MESSAGE,
    },
    {
      group: [...KEYRING_CONSTRUCTION_SOURCE_MODULE_PATTERNS],
      importNamePattern: KEYRING_CONSTRUCTION_RESTRICTED_IMPORT_NAME_PATTERN,
      allowTypeImports: true,
      message: KEYRING_BOUNDARY_MESSAGE,
    },
    {
      group: [...KEYRING_CONSTRUCTION_SOURCE_MODULE_PATTERNS],
      message: KEYRING_BOUNDARY_MESSAGE,
    },
  ],
};

const keyringBoundarySyntaxRules = KEYRING_CONSTRUCTION_RESTRICTED_IMPORTS.map((importName) => ({
  selector: `ImportDeclaration[importKind!="type"] ImportSpecifier[imported.name="${importName}"][importKind!="type"]`,
  message: KEYRING_BOUNDARY_MESSAGE,
}));

const keyringDynamicImportSyntaxRules = [
  {
    selector: `ImportExpression[source.value=/\\/crypto\\/src\\/(${KEYRING_CONSTRUCTION_SOURCE_MODULE_BASENAMES_REGEX})\\.js$/]`,
    message: KEYRING_BOUNDARY_MESSAGE,
  },
  {
    selector: `ImportExpression[source.value=/\\/crypto\\/src\\/(${KEYRING_CONSTRUCTION_SOURCE_MODULE_BASENAMES_REGEX})$/]`,
    message: KEYRING_BOUNDARY_MESSAGE,
  },
] as const;

const decryptDynamicImportSyntaxRules = [
  {
    selector: 'ImportExpression[source.value="@insecur/crypto"]',
    message: DECRYPT_IMPORT_BOUNDARY_MESSAGE,
  },
  {
    selector:
      "ImportExpression[source.value=/\\/crypto\\/src\\/(envelope|encryption|provider-credential-envelope|sensitive-metadata-envelope)\\.js$/]",
    message: DECRYPT_IMPORT_BOUNDARY_MESSAGE,
  },
  {
    selector:
      "ImportExpression[source.value=/\\/crypto\\/src\\/(envelope|encryption|provider-credential-envelope|sensitive-metadata-envelope)$/]",
    message: DECRYPT_IMPORT_BOUNDARY_MESSAGE,
  },
] as const;

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.wrangler/**", "**/coverage/**", "**/*.gen.ts"] },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: [
      "vitest.config.ts",
      "vitest.coverage.config.ts",
      "vitest.mutation.config.ts",
      "packages/access/test/**/*.ts",
      "packages/access/vitest.config.ts",
      "packages/access/vitest.rls.config.ts",
      "packages/secret-store{,-contracts}/test/**/*.ts",
      "packages/secret-store{,-contracts}/vitest.config.ts",
      "packages/secret-store/vitest.rls.config.ts",
      "packages/runtime-injection/test/**/*.ts",
      "packages/runtime-injection/vitest.config.ts",
      "packages/runtime-injection/vitest.rls.config.ts",
      "packages/audit/test/**/*.ts",
      "packages/audit/vitest.config.ts",
      "packages/audit/vitest.rls.config.ts",
      "packages/operations/test/**/*.ts",
      "packages/operations/vitest.config.ts",
      "packages/operations/vitest.rls.config.ts",
      "packages/high-assurance/test/**/*.ts",
      "packages/high-assurance/vitest.config.ts",
      "packages/onboarding/test/**/*.ts",
      "packages/onboarding/vitest.config.ts",
      "packages/onboarding/vitest.rls.config.ts",
      "packages/app-connection/test/**/*.ts",
      "packages/app-connection/vitest.config.ts",
      "packages/app-connection/vitest.rls.config.ts",
      "packages/instance-bootstrap/test/**/*.ts",
      "packages/instance-bootstrap/vitest.config.ts",
      "packages/instance-bootstrap/vitest.rls.config.ts",
      "packages/cli/test/**/*.ts",
      "packages/cli/vitest.config.ts",
      "packages/machine-auth/test/**/*.ts",
      "packages/machine-auth/vitest.config.ts",
      "packages/machine-auth/vitest.rls.config.ts",
      "packages/token-signing/src/**/*.test.ts",
      "packages/token-signing/vitest.config.ts",
      "packages/tenant-store/test/**/*.ts",
      "packages/tenant-store/vitest.config.ts",
      "packages/tenant-store/vitest.rls.config.ts",
      "packages/tenant-store/drizzle.config.ts",
      "packages/tenant-store/scripts/**/*.ts",
      "packages/backup-restore/test/**/*.ts",
      "packages/backup-restore/vitest.config.ts",
      "packages/worker-kit/src/**/*.test.ts",
      "packages/worker-kit/vitest.config.ts",
      "apps/api/test/**/*.ts",
      "apps/api/vitest.config.ts",
      "apps/api/vitest.e2e.config.ts",
      "apps/api/vitest.canary.config.ts",
      "apps/runtime/src/**/*.test.ts",
      "apps/runtime/vitest.config.ts",
      "apps/site/vitest.config.ts",
      "apps/web/src/**/*.test.ts",
      "apps/web/vitest.config.ts",
      "packages/ui/src/**/*.test.{ts,tsx}",
    ],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["packages/cli/**/*.ts", "packages/*/scripts/**/*.mjs", "scripts/**/*.{ts,mjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs", "eslint.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["scripts/lint-fixtures/**/*.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["**/.decrypt-import-boundary-negative.fixture.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    rules: {
      complexity: ["error", 8],
      "max-depth": ["error", 3],
      "max-lines": ["error", { max: 250, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 50, skipBlankLines: true, skipComments: true }],
      "max-nested-callbacks": ["error", 3],
      "max-params": ["error", 4],
      "max-statements": ["error", 15],
    },
  },
  {
    files: ["eslint.config.ts", "packages/tenant-store/src/db/schema/schema-shape.ts"],
    rules: {
      "max-lines": "off",
    },
  },
  {
    files: ["scripts/security-attest.mjs"],
    rules: {
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["packages/secret-store-contracts/src/is-valid-utf8.ts"],
    rules: {
      complexity: "off",
      "max-lines-per-function": "off",
      "max-statements": "off",
    },
  },
  {
    // TanStack Router control flow: loaders `throw redirect(...)` (a Response subtype) and
    // `throw notFound()` by design; the router catches both.
    files: ["apps/web/src/routes/**/*.tsx"],
    rules: {
      "@typescript-eslint/only-throw-error": [
        "error",
        {
          allow: [
            {
              from: "package",
              package: "@tanstack/router-core",
              name: ["Redirect", "NotFoundError"],
            },
            { from: "lib", name: "Response" },
          ],
        },
      ],
    },
  },
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/*.e2e.test.ts",
      "**/*.integration.test.ts",
    ],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "max-statements": "off",
      complexity: "off",
    },
  },
  {
    files: ["packages/backup-restore/src/**/*.ts"],
    rules: {
      complexity: ["error", 12],
      "max-lines-per-function": ["error", { max: 65, skipBlankLines: true, skipComments: true }],
      "max-statements": ["error", 25],
    },
  },
  {
    files: [
      "packages/backup-restore/src/parse-evidence.ts",
      "packages/backup-restore/src/evaluate-readiness.ts",
    ],
    rules: {
      complexity: ["error", 20],
      "max-lines-per-function": ["error", { max: 90, skipBlankLines: true, skipComments: true }],
      "max-statements": ["error", 30],
    },
  },
  {
    files: ["packages/cli/src/config/resolve-scope.ts"],
    rules: {
      complexity: "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/non-nullable-type-assertion-style": "off",
    },
  },
  // Decrypt-egress (ADR-0071) and keyring-construction (ADR-0064/0077) share one rule block so
  // both path sets apply. Decrypt ignores only — keyring-only paths must not bypass decrypt lint.
  {
    files: ["**/*.ts"],
    ignores: [
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/*.e2e.test.ts",
      "**/*.integration.test.ts",
      "packages/crypto/src/**",
      "apps/runtime/src/**",
      ...DECRYPT_IMPORT_ALLOWLIST,
    ],
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...decryptImportBoundaryOptions.paths, ...keyringBoundaryOptions.paths],
          patterns: [...decryptImportBoundaryOptions.patterns, ...keyringBoundaryOptions.patterns],
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...decryptDynamicImportSyntaxRules,
        ...keyringDynamicImportSyntaxRules,
        ...keyringBoundarySyntaxRules,
      ],
    },
  },
  // Keyring-only allowlist: keep decrypt boundary, drop keyring fencing for composition helpers.
  {
    files: [...KEYRING_CONSTRUCTION_VALUE_IMPORT_ALLOWLIST],
    ignores: [
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/*.e2e.test.ts",
      "**/*.integration.test.ts",
      ...DECRYPT_IMPORT_ALLOWLIST,
    ],
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "no-restricted-imports": ["error", decryptImportBoundaryOptions],
      "no-restricted-syntax": ["error", ...decryptDynamicImportSyntaxRules],
    },
  },
  // Runtime Worker source: decrypt-egress boundary only. Keyring construction is permitted here.
  {
    files: ["apps/runtime/src/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.spec.ts", "**/*.e2e.test.ts", "**/*.integration.test.ts"],
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "no-restricted-imports": ["error", decryptImportBoundaryOptions],
      "no-restricted-syntax": ["error", ...decryptDynamicImportSyntaxRules],
    },
  },
  eslintConfigPrettier,
);
