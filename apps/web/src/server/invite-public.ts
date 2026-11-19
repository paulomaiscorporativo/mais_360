import "server-only";
import { cache } from "react";
import {
  enabledProjectFeatures,
  eventStartAt,
  inviteStatus,
  readAmenities,
  readHotels,
  rsvpState,
} from "@mais/core";
import { modulesForTenant } from "./modules";
import { tenantDb } from "./tenant-db";
import { resolvePublicTenant } from "./tenant-resolve";

/**
 * Credencial digital / convite público: <cliente>/c/<token>.
 *
 * Serve qualquer inscrição (é o conteúdo do QR do crachá). Quando o projeto
 * tem o recurso de convites e a inscrição tem convite, a página também mostra
 * a resposta (RSVP), a mesa e as informações do evento.
 */
export const loadCredential = cache(async (tenantSlug: string, token: string) => {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return null;
  const tenant = await resolvePublicTenant(tenantSlug);
  if (!tenant || tenant.status !== "ACTIVE") return null;
  const db = tenantDb({ tenantId: tenant.id });
  const reg = await db.registration.findFirst({
    where: { token, project: { archivedAt: null } },
    include: {
      person: true,
      category: true,
      invite: { include: { companyQuota: { select: { companyName: true } } } },
      seat: { include: { table: { select: { number: true, name: true } } } },
      project: { include: { features: true, inviteSettings: true } },
    },
  });
  if (!reg) return null;

  const project = reg.project;
  const features = enabledProjectFeatures(project.features, await modulesForTenant(tenant));
  const tz = project.timezone ?? tenant.timezone;
  const settings = project.inviteSettings;
  const isInvite = !!reg.invite && features.has("INVITES");
  const startsAt = project.startsAt
    ? eventStartAt(project.startsAt, settings?.eventTime ?? "", tz)
    : null;
  // Sem data de término, o evento vale até o fim do dia seguinte ao início
  const eventEnd =
    project.endsAt ??
    (project.startsAt ? new Date(project.startsAt.getTime() + 36 * 3600_000) : null);

  return {
    tenant,
    db,
    registration: reg,
    project,
    features,
    timeZone: tz,
    isInvite,
    startsAt,
    eventEnd,
    eventTime: settings?.eventTime ?? "",
    dressCode: settings?.dressCode ?? "",
    deadline: settings?.inviteDeadline ?? null,
    hotels: readHotels(settings?.nearbyHotels),
    amenities: readAmenities(settings?.amenities),
    status: inviteStatus({ ...reg, sentAt: reg.invite?.sentAt }),
    rsvp: isInvite
      ? rsvpState(reg, { deadline: settings?.inviteDeadline ?? null, eventEnd })
      : null,
    seat:
      reg.seat && features.has("TABLES")
        ? { table: reg.seat.table.number, tableName: reg.seat.table.name, seat: reg.seat.seat }
        : null,
  };
});

export type Credential = NonNullable<Awaited<ReturnType<typeof loadCredential>>>;
