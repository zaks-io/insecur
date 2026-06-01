import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

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
      "packages/audit/test/**/*.ts",
      "packages/tenant-store/test/**/*.ts",
      "packages/tenant-store/vitest.rls.config.ts",
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
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
    },
  },
  eslintConfigPrettier,
);
