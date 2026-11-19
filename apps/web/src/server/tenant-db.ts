import "server-only";
import { Prisma } from "@mais/db";
import { prisma } from "./db";

/**
 * Cliente Prisma com escopo de cliente (tenant). Em todo modelo que tem
 * `tenantId`, injeta o filtro nas leituras/atualizações/exclusões e o valor
 * nas criações. É a ÚNICA forma permitida de acessar dados de negócio
 * (CLAUDE.md) — um esquecimento de `where: { tenantId }` não vaza dados de
 * outro cliente.
 */

const TENANT_MODELS = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === "tenantId"))
    .map((m) => m.name),
);

const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

export function isTenantScopedModel(model: string) {
  return TENANT_MODELS.has(model);
}

type AnyArgs = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
};

export function tenantDb(ctx: { tenantId: string }) {
  const { tenantId } = ctx;
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as AnyArgs;

          if (WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), tenantId };
          }
          if (operation === "create") {
            a.data = { ...(a.data as Record<string, unknown>), tenantId };
          }
          if (operation === "createMany" || operation === "createManyAndReturn") {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            a.data = rows.map((r) => ({ ...(r as Record<string, unknown>), tenantId }));
          }
          if (operation === "upsert") {
            a.create = { ...(a.create ?? {}), tenantId };
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
