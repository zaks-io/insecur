import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/** ADR-0071 decrypt-import allowlist of record. */
const DECRYPT_IMPORT_ALLOWLIST = [
  "packages/runtime-injection/src/decrypt-grant-secret.ts",
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
  {
    ignores: ["**/dist/**", "**/.wrangler/**", "**/coverage/**", "**/*.gen.ts"],
  },
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
      "packages/access/test/**/*.ts",
      "packages/access/vitest.config.ts",
      "packages/access/vitest.rls.config.ts",
      "packages/secret-store/test/**/*.ts",
      "packages/secret-store/vitest.config.ts",
      "packages/runtime-injection/test/**/*.ts",
      "packages/runtime-injection/vitest.config.ts",
      "packages/audit/test/**/*.ts",
      "packages/operations/test/**/*.ts",
      "packages/operations/vitest.config.ts",
      "packages/operations/vitest.rls.config.ts",
      "packages/onboarding/test/**/*.ts",
      "packages/onboarding/vitest.config.ts",
      "packages/instance-bootstrap/test/**/*.ts",
      "packages/instance-bootstrap/vitest.config.ts",
      "packages/cli/test/**/*.ts",
      "packages/cli/vitest.config.ts",
      "packages/tenant-store/test/**/*.ts",
      "packages/tenant-store/vitest.rls.config.ts",
      "packages/tenant-store/drizzle.config.ts",
      "apps/worker/test/**/*.ts",
      "apps/worker/vitest.config.ts",
      "apps/worker/vitest.e2e.config.ts",
    ],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["packages/cli/**/*.ts", "scripts/**/*.{ts,mjs}"],
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
    files: ["packages/secret-store/src/is-valid-utf8.ts"],
    rules: {
      complexity: "off",
      "max-lines-per-function": "off",
      "max-statements": "off",
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
    files: ["packages/cli/src/config/resolve-scope.ts"],
    rules: {
      complexity: "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/non-nullable-type-assertion-style": "off",
    },
  },
  {
    files: ["**/*.ts"],
    ignores: [
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/*.e2e.test.ts",
      "**/*.integration.test.ts",
      "packages/crypto/src/**",
      ...DECRYPT_IMPORT_ALLOWLIST,
    ],
    rules: {
      "no-restricted-imports": ["error", decryptImportBoundaryOptions],
      "no-restricted-syntax": ["error", ...decryptDynamicImportSyntaxRules],
    },
  },
  eslintConfigPrettier,
);
