import { readAmenities, readHotels } from "@mais/core";
import { guard } from "@/server/auth";
import { DEFAULT_INVITE, eventSettings } from "@/server/events";
import { requireProjectFeature } from "@/server/projects";
import { toDateInput } from "../../../../(gestao)/projetos/format";
import { EventSettingsForm } from "./form";

export default async function EventSettingsPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, project, "INVITES", "OPERATOR"));
  const s = await eventSettings(p.db, p.projectId);
  const tz = p.project.timezone ?? p.tenant.timezone;
  const template = await p.db.messageTemplate.findFirst({
    where: { projectId: p.projectId, purpose: "INVITE", archivedAt: null },
  });

  return (
    <EventSettingsForm
      tenant={tenant}
      projectId={p.projectId}
      communicationHref={`/console/${ws}/clientes/${tenant}/comunicacao/modelos`}
      initial={{
        eventTime: s.eventTime,
        dressCode: s.dressCode,
        inviteDeadline: toDateInput(s.inviteDeadline, tz),
        defaultQuota: String(s.defaultQuota),
        autoSendOnCompanyRegistration: s.autoSendOnCompanyRegistration,
        allowCompanion: s.allowCompanion,
        venueName: p.project.venueName,
        venueAddress: p.project.venueAddress,
        description: p.project.description,
        hotels: readHotels(s.nearbyHotels).map((h) => ({
          nome: h.nome,
          endereco: h.endereco ?? "",
          telefone: h.telefone ?? "",
          distancia: h.distancia ?? "",
          link: h.link ?? "",
        })),
        amenities: readAmenities(s.amenities).map((a) => ({
          titulo: a.titulo,
          descricao: a.descricao ?? "",
        })),
      }}
      message={{
        custom: !!template,
        emailSubject: template?.emailSubject ?? DEFAULT_INVITE.emailSubject,
        emailBody: template?.emailBody ?? DEFAULT_INVITE.emailBody,
        whatsappBody: template?.whatsappBody ?? DEFAULT_INVITE.whatsappBody,
      }}
      timezone={tz}
    />
  );
}
