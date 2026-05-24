import { defineConfig, globalIgnores } from "eslint/config";
import n from "eslint-plugin-n";
import prettier from "eslint-plugin-prettier";
import globals from "globals";
import jsoncPlugin from "eslint-plugin-jsonc";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import vuePlugin from "eslint-plugin-vue";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  globalIgnores(
    [
      "!**/.*",
      "**/node_modules/.*",
      "**/sample.devcontainer.json",
      "**/devcontainer.json"
    ]
  ),
  {
    extends: compat.extends("eslint:recommended"),

    plugins: {
      n,
      prettier,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jest,
        ...globals.node,
      },
    },
  },
  ...jsoncPlugin.configs["flat/recommended-with-json"],
  ...jsoncPlugin.configs["flat/recommended-with-jsonc"],
  ...jsoncPlugin.configs["flat/recommended-with-json5"],
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.jsx"],
    extends: compat.extends("plugin:react/recommended"),

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",

      parserOptions: {
        ecmaFeatures: {
          jsx: true,
          modules: true,
        },
      },
    },
  },
  {
    files: ["**/*.ts", "**/*.cts", "**/*.mts", "**/*.tsx"],

    extends: compat.extends(
      "plugin:@typescript-eslint/recommended",
      "plugin:n/recommended",
      "plugin:react/recommended",
      "prettier",
    ),

    plugins: {
      "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  ...vuePlugin.configs["flat/recommended"],
  {
    /* Custom settings to allow extensionless TypeScript imports like
       import Foo from './libs/mongo/Logs'
       without having to specify .ts and without disabling the rule. */
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    plugins: { n },
    settings: {
      // Allow plugin-n resolver to attempt these extensions when import has none
      'n/resolverExtensions': [".ts", ".tsx", ".d.ts", ".js", ".mjs", ".cjs", ".json"],
    },
    rules: {
      // Configure no-missing-import to try TypeScript extensions before erroring
      'n/no-missing-import': ['error', {
        tryExtensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json"],
      }],
      // Allow extensionless imports (disable requirement to specify file extensions)
      'n/file-extension-in-import': 'off',
      // Application code, not a published package – disable unpublished import rule
      'n/no-unpublished-import': 'off',
    },
  },
]);
