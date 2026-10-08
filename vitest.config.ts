import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 15000,
    env: {
      AI_MOCK_MODE: "true",
      ALLOW_DEMO_ACCOUNTS: "true",
      AETHER_SECRET: "test-secret-not-for-production-use",
      NODE_ENV: "test",
    },
    server: {
      deps: {
        external: ["node:sqlite"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  ssr: {
    external: ["node:sqlite"],
  },
});
