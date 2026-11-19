import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Teste de integração da migração com PostgreSQL real (banco descartável) e o
 * banco SQLite de desenvolvimento da ABIEC (copiado para uma pasta temporária).
 * Preparar uma vez:
 *   DATABASE_URL=<TEST_DATABASE_URL> npx prisma db push --skip-generate   (em packages/db)
 * Rodar:
 *   npm run test:integration -w @mais/migrate
 * Sem o arquivo do legado (LEGACY_ABIEC_DB), o teste é pulado.
 */
const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  test: {
    include: ["packages/migrate/src/**/*.itest.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 60_000,
    env: {
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://mais:mais@localhost:5433/mais_migracao?schema=public",
      LEGACY_ABIEC_DB:
        process.env.LEGACY_ABIEC_DB ?? "C:/Users/Mais Corporativo/abiec/plataforma/prisma/dev.db",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? randomBytes(32).toString("base64"),
    },
  },
});
