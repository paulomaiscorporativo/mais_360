import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Testes de integração com PostgreSQL real (banco descartável).
 * Preparar uma vez:
 *   DATABASE_URL=<TEST_DATABASE_URL> npx prisma db push --skip-generate   (em packages/db)
 * Rodar:
 *   npm run test:integration -w @mais/messaging
 */
const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  test: {
    include: ["packages/messaging/src/**/*.itest.ts", "apps/worker/src/**/*.itest.ts"],
    environment: "node",
    // Um banco compartilhado: arquivos em sequência
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://mais:mais@localhost:5433/mais_test_messaging?schema=public",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? randomBytes(32).toString("base64"),
      APP_URL: "https://plataforma.teste",
      SMTP_HOST: process.env.SMTP_HOST ?? "localhost",
      SMTP_PORT: process.env.SMTP_PORT ?? "1025",
      SMTP_SECURE: "false",
      SMTP_USER: "",
      SMTP_PASS: "",
      SMTP_FROM: "Mais 360 Testes <testes@mais.tur.br>",
      MAILPIT_API: process.env.MAILPIT_API ?? "http://localhost:8025",
      EVOLUTION_URL: "",
      EVOLUTION_APIKEY: "",
    },
  },
});
