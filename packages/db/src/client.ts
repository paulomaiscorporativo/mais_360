import { PrismaClient } from "@prisma/client";

// Uma instância por processo; em desenvolvimento o hot reload do Next reaproveita a mesma.
const globalForPrisma = globalThis as unknown as { __maisPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__maisPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__maisPrisma = prisma;
