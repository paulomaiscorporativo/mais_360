import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Testes de integração do app web com PostgreSQL real (banco descartável).
 * Preparar uma vez:
 *   DATABASE_URL=<TEST_DATABASE_URL> npx prisma db push --skip-generate   (em packages/db)
 * Rodar:
 *   npm run test:integration -w @mais/web
 */
const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  test: {
    include: ["apps/web/src/**/*.itest.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://mais:mais@localhost:5433/mais_test_web?schema=public",
    },
  },
});
