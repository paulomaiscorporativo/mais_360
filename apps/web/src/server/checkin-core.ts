import { inviteStatus, parseScan, type InviteStatus } from "@mais/core";
import type { Prisma, PrismaClient } from "@mais/db";
import { fireAutomationEvent } from "./automation-events";

/**
 * CHECK-IN — núcleo com banco, sem dependências do Next (testado em
 * checkin.itest.ts contra PostgreSQL real).
 *
 * Idempotente e seguro com vários leitores ao mesmo tempo: a gravação é
 * condicional (`checkedInAt IS NULL`), então duas leituras simultâneas do
 * mesmo QR resultam em UM credenciamento e um "já credenciado".
 * Toda consulta leva `tenantId` explícito.
 */

export type CheckinGuest = {
  id: string;
  name: string;
  company: string;
  category: string;
  table: string;
  shortCode: string;
  status: InviteStatus;
  checkedInAt: string | null;
};

export type CheckinResult =
  | { ok: true; already: boolean; guest: CheckinGuest }
  | { ok: false; error: string; guest?: CheckinGuest };

const include = {
  person: true,
  category: true,
  invite: { include: { companyQuota: { select: { companyName: true } } } },
  seat: { include: { table: true } },
} satisfies Prisma.RegistrationInclude;

type Row = Prisma.RegistrationGetPayload<{ include: typeof include }>;

function toGuest(r: Row): CheckinGuest {
  return {
    id: r.id,
    name: `${r.person.firstName} ${r.person.lastName}`.trim(),
    company: r.invite?.companyQuota?.companyName || r.displayCompany,
    category: r.category?.name ?? "",
    table: r.seat
      ? `Mesa ${r.seat.table.number}${r.seat.seat ? ` · cadeira ${r.seat.seat}` : ""}`
      : "",
    shortCode: r.shortCode,
    status: inviteStatus({ ...r, sentAt: r.invite?.sentAt }),
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
  };
}

/** Credencia pelo QR (URL /c/<token>), token cru ou código curto. */
export async function checkInRegistration(
  db: PrismaClient,
  scope: { tenantId: string; projectId: string },
  raw: string,
  operator: string,
  now: Date = new Date(),
): Promise<CheckinResult> {
  const target = parseScan(raw);
  if (!target) return { ok: false, error: "Não reconhecemos esse código. Tente de novo." };
  const where = {
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    ...(target.kind === "token" ? { token: target.token } : { shortCode: target.code }),
  };
  const r = await db.registration.findFirst({ where, include });
  if (!r) return { ok: false, error: "Convite não encontrado neste evento." };
  if (r.status === "CANCELED")
    return { ok: false, error: "Convite cancelado. Encaminhe à organização.", guest: toGuest(r) };
  if (r.checkedInAt) return { ok: true, already: true, guest: toGuest(r) };

  // Quem chega sem ter respondido (ou tendo recusado) passa a confirmado
  const status = r.status === "WAITLIST" ? r.status : "CONFIRMED";
  const won = await db.registration.updateMany({
    where: { id: r.id, tenantId: scope.tenantId, checkedInAt: null, status: { not: "CANCELED" } },
    data: {
      checkedInAt: now,
      checkedInBy: operator.slice(0, 120),
      status,
      ...(r.confirmedAt ? {} : { confirmedAt: now }),
    },
  });
  const fresh = await db.registration.findFirst({
    where: { id: r.id, tenantId: scope.tenantId },
    include,
  });
  if (!fresh) return { ok: false, error: "Convite não encontrado neste evento." };
  if (won.count === 0) {
    // Outra leitura credenciou (ou a organização cancelou) no mesmo instante
    if (fresh.status === "CANCELED")
      return {
        ok: false,
        error: "Convite cancelado. Encaminhe à organização.",
        guest: toGuest(fresh),
      };
    return { ok: true, already: true, guest: toGuest(fresh) };
  }
  // Réguas de check-in (boas-vindas): só enfileira, o balcão não espera envio
  await fireAutomationEvent(db, {
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    trigger: "CHECKED_IN",
    registrationIds: [r.id],
    at: now,
  });
  return { ok: true, already: false, guest: toGuest(fresh) };
}

/** Desfaz o credenciamento (engano na recepção). Devolve se havia o que desfazer. */
export async function undoCheckInRegistration(
  db: PrismaClient,
  scope: { tenantId: string; projectId: string },
  registrationId: string,
): Promise<boolean> {
  const r = await db.registration.updateMany({
    where: {
      id: registrationId,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      checkedInAt: { not: null },
    },
    data: { checkedInAt: null, checkedInBy: "" },
  });
  return r.count > 0;
}
