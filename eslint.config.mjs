import nestjsTyped from "@darraghor/eslint-plugin-nestjs-typed";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@darraghor/nestjs-typed": nestjsTyped.plugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      eqeqeq: "error",
      "@darraghor/nestjs-typed/param-decorator-name-matches-route-param": "error",
      "@darraghor/nestjs-typed/injectable-should-be-provided": "warn",
    },
  },
  eslintConfigPrettier,
]);
