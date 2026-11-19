import { buildIcs } from "@mais/core";
import { loadCredential } from "@/server/invite-public";
import { tenantPublicBase } from "@/server/public-links";

/** Arquivo de agenda (.ics) do evento, para o convidado salvar no calendário. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantSlug: string; token: string }> },
) {
  const { tenantSlug, token } = await params;
  const c = await loadCredential(tenantSlug, token);
  if (!c || !c.startsAt) return new Response("Não encontrado.", { status: 404 });
  const url = `${await tenantPublicBase(c.tenant)}/c/${c.registration.token}`;
  const ics = buildIcs({
    uid: `${c.registration.id}@mais360`,
    title: c.project.name,
    start: c.startsAt,
    end: c.project.endsAt,
    location: [c.project.venueName, c.project.venueAddress].filter(Boolean).join(" — "),
    description: [
      c.dressCode && `Traje: ${c.dressCode}`,
      c.seat && `Mesa ${c.seat.table}${c.seat.seat ? `, cadeira ${c.seat.seat}` : ""}`,
      `Seu convite: ${url}`,
    ]
      .filter(Boolean)
      .join("\n"),
    url,
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="evento.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
