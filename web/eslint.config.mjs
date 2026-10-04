import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Explicit ask, 2026-10-04: "whenever the website is trying to communicate
  // to a user it should use the react toast" — useToast() (success/error/
  // confirm) from components/ui/ToastProvider.tsx, never the browser dialogs.
  {
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "alert", message: "Use useToast().error/success instead." },
        { name: "confirm", message: "Use await useToast().confirm(...) instead." },
        { name: "prompt", message: "Use a form or sheet instead of a browser prompt." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "alert", message: "Use useToast().error/success instead." },
        { object: "window", property: "confirm", message: "Use await useToast().confirm(...) instead." },
        { object: "window", property: "prompt", message: "Use a form or sheet instead of a browser prompt." },
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
