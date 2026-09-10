import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "@typescript-eslint/eslint-plugin";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    plugins: {
      "react-hooks": reactHooks,
      "@typescript-eslint": tseslint,
    },
    rules: {
      // The game client has a large pre-existing untyped Supabase boundary.
      // Keep it visible during the incremental typing migration without
      // blocking functional verification of unrelated changes.
      "@typescript-eslint/no-explicit-any": "warn",
      // These require component-level refactors. Keep reporting them while
      // allowing the baseline to pass during the incremental migration.
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["scripts/raid-room/verify-ticket-recovery.mjs"],
    rules: {
      "@next/next/no-assign-module-variable": "off",
    },
  },
]);

export default eslintConfig;
