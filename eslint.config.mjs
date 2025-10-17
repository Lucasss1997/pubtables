// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Base Next + TS config via compat, then our overrides/ignores
export default [
  // Next.js recommended configs
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Global ignores (build outputs, generated files)
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },

  // Loosen lint rules for server/API code so builds don't fail on `any`
  {
    files: [
      "src/app/api/**/*.{ts,tsx}",
      "src/app/**/route.ts",
      "src/lib/**/*.ts",
      "prisma/**/*.ts",
    ],
    rules: {
      // Allow `any` in API/server code to keep CI happy
      "@typescript-eslint/no-explicit-any": "off",
      // Don’t fail builds because of underscore-prefixed unused vars/args
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // (Optional) Quiet a noisy hook warning in UI code if needed
  // {
  //   files: ["src/app/**/*.tsx"],
  //   rules: {
  //     "react-hooks/exhaustive-deps": "warn",
  //   },
  // },
];
