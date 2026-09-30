import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The Next.js app must never hold the Supabase service-role key: it bypasses RLS.
    // Jobs (Python) are the only consumer. See SECURITY.md. Playwright tests under tests/ may
    // use the *local* key to play the jobs' part (they never ship).
    files: ["src/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/SERVICE_ROLE/]",
          message: "The service-role key must never be used in the Next.js app (bypasses RLS).",
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'] > Literal[value=/SERVICE_ROLE/]",
          message: "The service-role key must never be used in the Next.js app (bypasses RLS).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
