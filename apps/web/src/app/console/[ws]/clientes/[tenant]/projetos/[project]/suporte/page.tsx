import { formatInZone } from "@mais/core";
import { guard } from "@/server/auth";
import { requireProjectFeature } from "@/server/projects";
import { projectTz } from "@/server/travel";
import { SupportDesk, type TicketRow } from "./desk";

export default async function SupportPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, project, "SUPPORT"));
  const tz = projectTz(p);
  const tickets = await p.db.supportTicket.findMany({
    where: { projectId: p.projectId },
    orderBy: { updatedAt: "desc" },
    take: 300,
    include: {
      registration: {
        select: {
          shortCode: true,
          person: { select: { firstName: true, lastName: true, email: true, phone: true } },
        },
      },
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
  const rows: TicketRow[] = tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    traveler: `${t.registration.person.firstName} ${t.registration.person.lastName}`.trim(),
    shortCode: t.registration.shortCode,
    email: t.registration.person.email,
    phone: t.registration.person.phone,
    updatedLabel: formatInZone(t.updatedAt, tz, "datetime"),
    messages: t.messages.map((m) => ({
      id: m.id,
      fromStaff: m.authorType === "USER",
      author: m.authorName,
      body: m.body,
      at: formatInZone(m.createdAt, tz, "datetime"),
      fileId: m.fileId,
    })),
  }));
  return <SupportDesk tenant={tenant} projectId={p.projectId} canEdit={p.canEdit} tickets={rows} />;
}
