import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node
    },
    rules: {
      // A handful of Mongoose/Express/gRPC boundaries need a typed escape hatch;
      // keep them visible as warnings rather than blocking the build.
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow intentionally-unused args/vars prefixed with _ (e.g. Express `_next`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  }
);
