import "server-only";
import { headers } from "next/headers";
import type { ActorType, Prisma } from "@mais/db";
import { prisma } from "./db";

export async function audit(entry: {
  action: string;
  actorType?: ActorType;
  actorLabel?: string;
  userId?: string | null;
  tenantId?: string | null;
  projectId?: string | null;
  entityType?: string;
  entityId?: string;
  data?: Prisma.InputJsonValue;
}) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? "").trim();
  await prisma.auditLog.create({
    data: {
      action: entry.action,
      actorType: entry.actorType ?? "USER",
      actorLabel: entry.actorLabel ?? "",
      userId: entry.userId ?? null,
      tenantId: entry.tenantId ?? null,
      projectId: entry.projectId ?? null,
      entityType: entry.entityType ?? "",
      entityId: entry.entityId ?? "",
      data: entry.data ?? {},
      ip,
    },
  });
}
