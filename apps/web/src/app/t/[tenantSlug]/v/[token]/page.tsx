import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  CalendarRange,
  Download,
  FileText,
  LifeBuoy,
  MapPin,
  Megaphone,
  Phone,
  Pin,
  Plane,
  Ticket,
} from "lucide-react";
import {
  countdown,
  documentRequirements,
  formatInZone,
  isVisibleTo,
  nights,
  PERSON_DOCUMENT_LABEL,
  PROJECT_DOCUMENT_LABEL,
  readTravelSettings,
  requiredDocumentKinds,
  visibleMural,
} from "@mais/core";
import { Avatar, Badge } from "@/components/ui";
import { FlightRoute } from "@/components/travel/flight-route";
import { formatPeriod } from "@/app/console/[ws]/clientes/[tenant]/(gestao)/projetos/format";
import {
  audienceViewerOf,
  isInternationalTrip,
  toFlightViews,
  travelerPortalUrl,
} from "@/server/travel";
import { loadTravelerPortal, travelerName } from "@/server/traveler-portal";
import { cn } from "@/lib/cn";
import { MyDocuments, SupportPanel, type PortalTicket } from "./portal-client";

type Params = { params: Promise<{ tenantSlug: string; token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenantSlug, token } = await params;
  const t = await loadTravelerPortal(tenantSlug, token);
  return {
    title: { absolute: t ? `${t.project.name} · ${t.tenant.name}` : "Portal do viajante" },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function TravelerPortalPage({ params }: Params) {
  const { tenantSlug, token } = await params;
  const t = await loadTravelerPortal(tenantSlug, token);
  if (!t) notFound();
  const { tenant, db, reg, person, project, features, tz } = t;
  const has = (f: Parameters<typeof features.has>[0]) => features.has(f);
  const viewer = audienceViewerOf(reg);
  const now = new Date();
  const base = await travelerPortalUrl(tenant, token);
  const fileHref = (id: string) => `${base}/arquivo/${id}`;
  const settings = readTravelSettings(project.settings);

  const [flights, hotels, itinerary, mural, projectDocs, personDocs, templates, tickets] =
    await Promise.all([
      has("FLIGHTS")
        ? db.flight.findMany({
            where: { projectId: project.id, passengers: { some: { registrationId: reg.id } } },
            orderBy: { departureAt: "asc" },
            include: {
              passengers: { where: { registrationId: reg.id }, include: { locator: true } },
            },
          })
        : [],
      has("ACCOMMODATION")
        ? db.accommodation.findMany({
            where: {
              projectId: project.id,
              rooms: { some: { occupants: { some: { registrationId: reg.id } } } },
            },
            orderBy: { checkIn: "asc" },
            include: {
              rooms: {
                where: { occupants: { some: { registrationId: reg.id } } },
                include: {
                  occupants: {
                    include: {
                      registration: {
                        select: {
                          id: true,
                          person: { select: { firstName: true, lastName: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          })
        : [],
      has("ITINERARY")
        ? db.itineraryItem.findMany({
            where: { projectId: project.id },
            orderBy: [{ date: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
          })
        : [],
      has("MURAL") ? db.muralPost.findMany({ where: { projectId: project.id, active: true } }) : [],
      has("DOCUMENTS") || has("VOUCHERS")
        ? db.projectDocument.findMany({
            where: {
              projectId: project.id,
              visibleToPerson: true,
              OR: [{ registrationId: null }, { registrationId: reg.id }],
            },
            orderBy: { createdAt: "desc" },
          })
        : [],
      has("DOCUMENTS")
        ? db.personDocument.findMany({
            where: { personId: person.id },
            orderBy: { createdAt: "desc" },
          })
        : [],
      has("VOUCHERS")
        ? db.documentTemplate.findMany({
            where: {
              kind: "VOUCHER",
              visibleToPerson: true,
              archivedAt: null,
              OR: [{ projectId: project.id }, { projectId: null }],
            },
            select: { id: true, name: true },
          })
        : [],
      has("SUPPORT")
        ? db.supportTicket.findMany({
            where: { registrationId: reg.id },
            orderBy: { updatedAt: "desc" },
            include: { messages: { orderBy: { createdAt: "asc" }, take: 100 } },
          })
        : [],
    ]);

  const flightViews = await toFlightViews(flights, tz);
  const posts = visibleMural(mural, viewer, now);
  const urgent = posts.filter((p) => p.urgent);
  const items = itinerary.filter((i) => i.audience !== "STAFF" || viewer.isStaff);
  const visibleItems = items.filter((i) => isVisibleTo(i, viewer));
  const days = new Map<string, typeof visibleItems>();
  for (const i of visibleItems) {
    const k = i.date ? formatInZone(i.date, tz, "weekday") : "A definir";
    days.set(k, [...(days.get(k) ?? []), i]);
  }
  const generalDocs = projectDocs.filter((d) => d.category !== "VOUCHER");
  const vouchers = projectDocs.filter((d) => d.category === "VOUCHER");
  const required = has("DOCUMENTS")
    ? requiredDocumentKinds(settings, await isInternationalTrip(db, project.id))
    : [];
  const requirements = documentRequirements(required, personDocs, project.endsAt, now);

  const start = project.startsAt ?? flights.find((f) => f.departureAt)?.departureAt ?? null;
  const cd = start ? countdown(start, now) : null;
  const ended = project.endsAt ? project.endsAt.getTime() < now.getTime() : false;
  const logo = tenant.branding?.logoFileId ? `/api/files/${tenant.branding.logoFileId}` : null;
  const banner = project.bannerFileId ? `/api/files/${project.bannerFileId}` : null;

  const sections = [
    has("MURAL") && { id: "avisos", label: "Avisos", icon: Megaphone },
    has("FLIGHTS") && { id: "voos", label: "Voos", icon: Plane },
    has("ACCOMMODATION") && { id: "hotel", label: "Hotel", icon: BedDouble },
    has("ITINERARY") && { id: "roteiro", label: "Roteiro", icon: CalendarRange },
    (has("DOCUMENTS") || has("VOUCHERS")) && {
      id: "documentos",
      label: "Documentos",
      icon: FileText,
    },
    has("SUPPORT") && { id: "suporte", label: "Ajuda", icon: LifeBuoy },
  ].filter((s): s is { id: string; label: string; icon: typeof Plane } => !!s);

  const tickets_: PortalTicket[] = tickets.map((tk) => ({
    id: tk.id,
    subject: tk.subject,
    status: tk.status,
    updatedLabel: formatInZone(tk.updatedAt, tz, "datetime"),
    messages: tk.messages.map((m) => ({
      id: m.id,
      fromStaff: m.authorType === "USER",
      author: m.authorType === "USER" ? m.authorName || "Equipe" : "Você",
      body: m.body,
      at: formatInZone(m.createdAt, tz, "datetime"),
    })),
  }));

  return (
    <div className="bg-surface-muted min-h-dvh pb-16">
      {/* Capa com a marca do cliente */}
      <header className="bg-brand text-brand-fg relative overflow-hidden">
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" className="absolute inset-0 size-full object-cover opacity-20" />
        )}
        <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full border border-current opacity-[0.08]" />
        <div className="relative mx-auto max-w-2xl px-5 pt-6 pb-10 sm:px-8">
          <div className="flex items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={tenant.name}
                className="h-9 w-auto max-w-[150px] rounded-sm bg-white/95 object-contain p-1"
              />
            ) : (
              <Avatar
                name={tenant.name}
                size="md"
                square
                className="bg-white/15 text-current ring-0"
              />
            )}
            <span className="text-sm font-medium opacity-80">{tenant.name}</span>
          </div>
          <p className="mt-8 text-base opacity-80">Olá, {person.socialName || person.firstName}</p>
          <h1 className="font-display mt-1 text-[36px] leading-[1.05] tracking-[-0.01em] sm:text-[44px]">
            {project.name}
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm opacity-90">
            {(project.startsAt || project.endsAt) && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {formatPeriod(project.startsAt, project.endsAt, tz)}
              </span>
            )}
            {(project.destination || project.venueName) && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" />
                {project.destination || project.venueName}
              </span>
            )}
          </div>
          {cd && !ended && (
            <p className="mt-6 inline-flex items-baseline gap-2 rounded-md bg-white/12 px-3 py-2 text-sm">
              {cd.past ? (
                "Boa viagem! Tudo o que você precisa está aqui."
              ) : (
                <>
                  <span className="text-xl font-semibold tabular-nums">
                    {cd.days > 0
                      ? `${cd.days} dia${cd.days === 1 ? "" : "s"}`
                      : `${cd.hours}h${String(cd.minutes).padStart(2, "0")}`}
                  </span>
                  para o embarque
                </>
              )}
            </p>
          )}
        </div>
      </header>

      {/* Navegação por seções (rola no celular) */}
      {sections.length > 1 && (
        <nav
          aria-label="Seções do portal"
          className="bg-surface/95 border-border sticky top-0 z-10 border-b backdrop-blur"
        >
          <ul className="mx-auto flex max-w-2xl [scrollbar-width:none] gap-1 overflow-x-auto px-3 py-2 sm:px-6 [&::-webkit-scrollbar]:hidden">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="text-fg-muted hover:bg-hover hover:text-fg inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap"
                  >
                    <Icon className="size-4" />
                    {s.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-5 sm:px-6">
        {settings.emergencyContact && (
          <div className="border-border bg-surface flex items-start gap-3 rounded-lg border p-4">
            <Phone className="text-brand-text mt-0.5 size-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Contato de emergência</p>
              <p className="text-fg-muted text-md whitespace-pre-line">
                {settings.emergencyContact}
              </p>
            </div>
          </div>
        )}

        {urgent.map((p) => (
          <div
            key={p.id}
            role="alert"
            className="border-danger-border bg-danger-bg flex items-start gap-3 rounded-lg border p-4"
          >
            <AlertTriangle className="text-danger mt-0.5 size-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-danger font-semibold">{p.title}</p>
              <p className="text-fg text-md mt-1 whitespace-pre-line">{p.message}</p>
            </div>
          </div>
        ))}

        {has("MURAL") && (
          <Section id="avisos" title="Avisos" icon={Megaphone}>
            {posts.filter((p) => !p.urgent).length === 0 ? (
              <Empty>
                {urgent.length
                  ? "Os avisos importantes estão em destaque acima."
                  : "Nenhum aviso por enquanto. Quando a equipe publicar, aparece aqui."}
              </Empty>
            ) : (
              <ul className="divide-border -my-2 divide-y">
                {posts
                  .filter((p) => !p.urgent)
                  .map((p) => (
                    <li key={p.id} className="py-3">
                      <div className="flex items-center gap-2">
                        {p.pinned && (
                          <Pin className="text-brand-text size-3.5" aria-label="Fixado" />
                        )}
                        <p className="font-semibold">{p.title}</p>
                      </div>
                      <p className="text-fg-muted text-md mt-1 whitespace-pre-line">{p.message}</p>
                      <p className="text-fg-subtle mt-1 text-xs">
                        {formatInZone(p.publishAt, tz, "datetime")}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </Section>
        )}

        {has("FLIGHTS") && (
          <Section id="voos" title="Seus voos" icon={Plane}>
            {flightViews.length === 0 ? (
              <Empty>Seus voos aparecem aqui assim que forem emitidos.</Empty>
            ) : (
              <ol className="flex flex-col gap-4">
                {flightViews.map((f, i) => {
                  const pax = flights[i]?.passengers[0];
                  const locator = pax?.locator?.code || flights[i]?.defaultLocator;
                  return (
                    <li key={f.id} className="border-border rounded-md border p-4">
                      <p className="text-fg-subtle mb-3 text-xs font-semibold capitalize">
                        {f.depDate}
                      </p>
                      <FlightRoute flight={f} />
                      {(locator || pax?.seat || pax?.eticket) && (
                        <dl className="border-border mt-4 grid grid-cols-3 gap-3 border-t pt-3 text-sm">
                          {locator && (
                            <div>
                              <dt className="text-fg-subtle text-xs">Localizador</dt>
                              <dd className="font-mono font-semibold">{locator}</dd>
                            </div>
                          )}
                          {pax?.seat && (
                            <div>
                              <dt className="text-fg-subtle text-xs">Assento</dt>
                              <dd className="font-mono font-semibold">{pax.seat}</dd>
                            </div>
                          )}
                          {(pax?.eticket || pax?.ticketNumber) && (
                            <div>
                              <dt className="text-fg-subtle text-xs">Bilhete</dt>
                              <dd className="font-mono">{pax.eticket || pax.ticketNumber}</dd>
                            </div>
                          )}
                        </dl>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
        )}

        {has("ACCOMMODATION") && (
          <Section id="hotel" title="Hospedagem" icon={BedDouble}>
            {hotels.length === 0 ? (
              <Empty>Sua hospedagem aparece aqui quando o quarto for confirmado.</Empty>
            ) : (
              <ul className="flex flex-col gap-4">
                {hotels.map((h) =>
                  h.rooms.map((r) => {
                    const inAt = r.checkIn ?? h.checkIn;
                    const outAt = r.checkOut ?? h.checkOut;
                    const mates = r.occupants
                      .filter((o) => o.registration.id !== reg.id)
                      .map((o) =>
                        `${o.registration.person.firstName} ${o.registration.person.lastName}`.trim(),
                      );
                    return (
                      <li key={r.id} className="border-border rounded-md border p-4">
                        <p className="text-lg font-semibold">{h.name}</p>
                        {(h.address || h.city) && (
                          <a
                            className="text-fg-muted mt-0.5 inline-flex items-start gap-1.5 text-sm hover:underline"
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([h.name, h.address, h.city].filter(Boolean).join(", "))}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MapPin className="mt-0.5 size-3.5 shrink-0" />
                            {[h.address, h.city].filter(Boolean).join(" · ")}
                          </a>
                        )}
                        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                          <div>
                            <dt className="text-fg-subtle text-xs">Entrada</dt>
                            <dd className="font-medium">{formatInZone(inAt, tz, "date") || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-fg-subtle text-xs">Saída</dt>
                            <dd className="font-medium">
                              {formatInZone(outAt, tz, "date") || "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-fg-subtle text-xs">Quarto</dt>
                            <dd className="font-mono font-semibold">{r.number || "a definir"}</dd>
                          </div>
                          <div>
                            <dt className="text-fg-subtle text-xs">Noites</dt>
                            <dd className="tabular font-medium">{nights(inAt, outAt) || "—"}</dd>
                          </div>
                        </dl>
                        {mates.length > 0 && (
                          <p className="text-fg-muted mt-3 text-sm">
                            Dividindo com {mates.join(", ")}
                          </p>
                        )}
                        {h.phone && (
                          <a
                            href={`tel:${h.phone.replace(/[^\d+]/g, "")}`}
                            className="text-brand-text mt-3 inline-flex h-12 items-center gap-2 text-sm font-medium"
                          >
                            <Phone className="size-4" /> Ligar para o hotel
                          </a>
                        )}
                      </li>
                    );
                  }),
                )}
              </ul>
            )}
          </Section>
        )}

        {has("ITINERARY") && (
          <Section id="roteiro" title="Roteiro" icon={CalendarRange}>
            {days.size === 0 ? (
              <Empty>O roteiro dia a dia aparece aqui assim que for publicado.</Empty>
            ) : (
              <div className="flex flex-col gap-6">
                {[...days].map(([day, list]) => (
                  <div key={day}>
                    <p className="text-md font-semibold capitalize">{day}</p>
                    <ol className="border-border mt-2 flex flex-col gap-3 border-l pl-4">
                      {list.map((i) => (
                        <li key={i.id} className={cn(i.status === "CANCELED" && "opacity-60")}>
                          <div className="flex items-baseline gap-3">
                            <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">
                              {i.startTime || "—"}
                            </span>
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "font-medium",
                                  i.status === "CANCELED" && "line-through",
                                )}
                              >
                                {i.title}
                                {i.status === "CANCELED" && (
                                  <Badge size="sm" className="ml-2 no-underline">
                                    Cancelado
                                  </Badge>
                                )}
                              </p>
                              {i.location && (
                                <p className="text-fg-muted inline-flex items-center gap-1 text-sm">
                                  <MapPin className="size-3.5" /> {i.location}
                                </p>
                              )}
                              {i.notes && (
                                <p className="text-fg-muted mt-1 text-sm whitespace-pre-line">
                                  {i.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {(has("DOCUMENTS") || has("VOUCHERS")) && (
          <Section id="documentos" title="Documentos" icon={FileText}>
            <div className="flex flex-col gap-6">
              {has("VOUCHERS") && (
                <div>
                  <p className="text-fg-subtle mb-2 text-xs font-semibold">Vouchers</p>
                  {vouchers.length === 0 && templates.length === 0 ? (
                    <Empty>Seus vouchers aparecem aqui quando forem emitidos.</Empty>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {vouchers.map((d) => (
                        <FileLink
                          key={d.id}
                          href={fileHref(d.fileId)}
                          icon={Ticket}
                          title={d.title}
                        />
                      ))}
                      {templates
                        .filter((tp) => !vouchers.some((v) => v.title === tp.name))
                        .map((tp) => (
                          <FileLink
                            key={tp.id}
                            href={`${base}/voucher/${tp.id}`}
                            icon={Ticket}
                            title={tp.name}
                            hint="Gerado na hora com seus dados"
                          />
                        ))}
                    </ul>
                  )}
                </div>
              )}
              {has("DOCUMENTS") && (
                <>
                  <div>
                    <p className="text-fg-subtle mb-2 text-xs font-semibold">Da viagem</p>
                    {generalDocs.length === 0 ? (
                      <Empty>Bilhetes, seguro e outros arquivos da viagem aparecem aqui.</Empty>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {generalDocs.map((d) => (
                          <FileLink
                            key={d.id}
                            href={fileHref(d.fileId)}
                            icon={FileText}
                            title={d.title}
                            hint={PROJECT_DOCUMENT_LABEL[d.category]}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                  <MyDocuments
                    tenantSlug={tenantSlug}
                    token={token}
                    canUpload={settings.travelerUploads}
                    requirements={requirements}
                    docs={personDocs.map((d) => ({
                      id: d.id,
                      label: PERSON_DOCUMENT_LABEL[d.kind],
                      href: fileHref(d.fileId),
                      expiresLabel: d.expiresAt ? formatInZone(d.expiresAt, "UTC", "date") : "",
                    }))}
                  />
                </>
              )}
            </div>
          </Section>
        )}

        {has("SUPPORT") && (
          <Section id="suporte" title="Precisa de ajuda?" icon={LifeBuoy}>
            <SupportPanel tenantSlug={tenantSlug} token={token} tickets={tickets_} />
          </Section>
        )}

        <footer className="text-fg-subtle mt-6 text-center text-xs">
          {travelerName(person)} · código <span className="font-mono">{reg.shortCode}</span>
          <br />
          Este link é pessoal. Não compartilhe.
        </footer>
      </main>
    </div>
  );
}

function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon: typeof Plane;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="border-border bg-surface scroll-mt-16 rounded-lg border p-5 sm:p-6"
    >
      <h2 id={`${id}-title`} className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Icon className="text-brand-text size-5" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-fg-muted text-md">{children}</p>;
}

function FileLink({
  href,
  icon: Icon,
  title,
  hint,
}: {
  href: string;
  icon: typeof Plane;
  title: string;
  hint?: string;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="border-border hover:bg-hover flex min-h-14 items-center gap-3 rounded-md border px-4 py-2"
      >
        <Icon className="text-fg-subtle size-5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          {hint && <span className="text-fg-subtle block text-xs">{hint}</span>}
        </span>
        <Download className="text-brand-text size-4 shrink-0" aria-hidden />
        <span className="sr-only">Abrir</span>
      </a>
    </li>
  );
}
