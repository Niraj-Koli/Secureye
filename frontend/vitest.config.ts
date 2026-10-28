import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.ts";

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: { modules: { classNameStrategy: "non-scoped" } },
      restoreMocks: true,
      // Dates are shown in local time; pin it so expectations don't depend on the machine.
      env: { TZ: "UTC" },
      // Pages are lazy-loaded and the first import compiles them, which can take a few seconds.
      testTimeout: 15_000,
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx", "src/**/*.d.ts"],
      },
    },
  }),
);
