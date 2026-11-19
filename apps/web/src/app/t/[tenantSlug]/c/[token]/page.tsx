import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import {
  Armchair,
  BedDouble,
  CalendarDays,
  CalendarPlus,
  Clock,
  Info,
  MapPin,
  Shirt,
} from "lucide-react";
import { Avatar, Badge, Notice } from "@/components/ui";
import { formatPeriod } from "@/app/console/[ws]/clientes/[tenant]/(gestao)/projetos/format";
import { loadCredential, type Credential } from "@/server/invite-public";
import { tenantPublicBase } from "@/server/public-links";
import { Rsvp } from "./rsvp";

type Params = { params: Promise<{ tenantSlug: string; token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenantSlug, token } = await params;
  const c = await loadCredential(tenantSlug, token);
  return {
    title: {
      absolute: c ? `${c.isInvite ? "Convite" : "Credencial"} · ${c.project.name}` : "Convite",
    },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

function longDate(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(d);
}
function hour(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone })
    .format(d)
    .replace(":", "h");
}

/**
 * Convite e credencial digital (<cliente>/c/<token>) — Experiência do
 * convidado: marca do cliente, resposta de presença e o QR da entrada.
 */
export default async function CredentialPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<{ confirmar?: string }> }) {
  const { tenantSlug, token } = await params;
  const sp = await searchParams;
  const c = await loadCredential(tenantSlug, token);
  if (!c) notFound();

  const { tenant, project, registration: reg, timeZone: tz } = c;
  const logo = tenant.branding?.logoFileId ? `/api/files/${tenant.branding.logoFileId}` : null;
  const banner = project.bannerFileId ? `/api/files/${project.bannerFileId}` : null;
  const url = `${await tenantPublicBase(tenant)}/c/${reg.token}`;
  const canceled = reg.status === "CANCELED";
  const qr = canceled
    ? null
    : await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  const name = reg.person.badgeName || `${reg.person.firstName} ${reg.person.lastName}`.trim();
  const company = reg.invite?.companyQuota?.companyName || reg.displayCompany;
  const multiDay =
    !!project.endsAt &&
    !!project.startsAt &&
    longDate(project.endsAt, tz) !== longDate(project.startsAt, tz);
  const venue = project.venueName || project.destination;
  const mapsUrl =
    venue || project.venueAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          [venue, project.venueAddress].filter(Boolean).join(", "),
        )}`
      : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="bg-brand text-brand-fg relative overflow-hidden px-6 pt-8 pb-10 sm:mt-8 sm:rounded-t-lg sm:px-10">
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" className="absolute inset-0 size-full object-cover opacity-25" />
        )}
        <div className="pointer-events-none absolute -top-20 -right-20 size-72 rounded-full border border-current opacity-[0.08]" />
        <div className="relative flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={tenant.name}
              className="h-9 w-auto max-w-[160px] rounded-sm bg-white/95 object-contain p-1"
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
        <p className="relative mt-8 text-base opacity-85">
          {c.isInvite ? `${reg.person.firstName}, você está convidado(a) para` : "Credencial de"}
        </p>
        <h1 className="font-display relative mt-1 text-[34px] leading-[1.08] tracking-[-0.01em] sm:text-[42px]">
          {project.name}
        </h1>
        <ul className="relative mt-5 flex flex-col gap-2 text-base opacity-90">
          {c.startsAt && (
            <li className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0" />
              <span className="first-letter:uppercase">
                {multiDay
                  ? formatPeriod(project.startsAt, project.endsAt, tz)
                  : longDate(c.startsAt, tz)}
              </span>
            </li>
          )}
          {c.startsAt && c.eventTime && (
            <li className="flex items-center gap-2">
              <Clock className="size-4 shrink-0" />
              {hour(c.startsAt, tz)}
            </li>
          )}
          {venue && (
            <li className="flex items-start gap-2">
              <MapPin className="mt-1 size-4 shrink-0" />
              <span>
                {venue}
                {project.venueAddress && (
                  <span className="block text-sm opacity-80">{project.venueAddress}</span>
                )}
              </span>
            </li>
          )}
        </ul>
      </header>

      <main className="bg-surface flex flex-1 flex-col gap-6 px-6 py-8 sm:mb-8 sm:rounded-b-lg sm:border sm:border-t-0 sm:px-10">
        {canceled ? (
          <Notice tone="warning" title="Convite cancelado" icon={<Info />}>
            Este convite não é mais válido. Em caso de dúvida, fale com a organização.
          </Notice>
        ) : (
          <>
            {c.rsvp?.open && (
              <Rsvp
                tenantSlug={tenantSlug}
                token={token}
                status={reg.status}
                until={
                  c.rsvp.until
                    ? new Intl.DateTimeFormat("pt-BR", {
                        day: "numeric",
                        month: "long",
                        timeZone: tz,
                      }).format(c.rsvp.until)
                    : null
                }
                highlight={sp.confirmar === "1"}
              />
            )}
            {c.rsvp && !c.rsvp.open && c.rsvp.reason !== "CHECKED_IN" && (
              <Notice tone="info" icon={<Info />}>
                {c.rsvp.message}
                {reg.status === "CONFIRMED" && " Sua presença está confirmada."}
              </Notice>
            )}
            <CredentialCard c={c} name={name} company={company} qr={qr} />
          </>
        )}

        {(c.dressCode || c.seat || mapsUrl || c.startsAt) && !canceled && (
          <section aria-label="Informações do evento" className="flex flex-col gap-3">
            {c.seat && (
              <Detail icon={<Armchair />} label="Seu lugar">
                Mesa {c.seat.table}
                {c.seat.tableName && ` · ${c.seat.tableName}`}
                {c.seat.seat && ` · cadeira ${c.seat.seat}`}
              </Detail>
            )}
            {c.dressCode && (
              <Detail icon={<Shirt />} label="Traje">
                {c.dressCode}
              </Detail>
            )}
            <div className="flex flex-wrap gap-2">
              {c.startsAt && (
                <a
                  href={`${token}/agenda`}
                  className="border-border-strong hover:bg-surface-muted inline-flex min-h-12 items-center gap-2 rounded-md border px-4 text-base font-medium"
                >
                  <CalendarPlus className="size-[18px]" /> Adicionar à agenda
                </a>
              )}
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-border-strong hover:bg-surface-muted inline-flex min-h-12 items-center gap-2 rounded-md border px-4 text-base font-medium"
                >
                  <MapPin className="size-[18px]" /> Como chegar
                </a>
              )}
            </div>
          </section>
        )}

        {project.description && !canceled && (
          <section aria-labelledby="sobre">
            <h2 id="sobre" className="text-lg font-semibold">
              Sobre o evento
            </h2>
            <p className="text-fg-muted mt-2 text-base whitespace-pre-line">
              {project.description}
            </p>
          </section>
        )}

        {c.amenities.length > 0 && !canceled && (
          <section aria-labelledby="servicos">
            <h2 id="servicos" className="text-lg font-semibold">
              Bom saber
            </h2>
            <dl className="mt-3 flex flex-col gap-3">
              {c.amenities.map((a) => (
                <div key={a.titulo}>
                  <dt className="text-base font-medium">{a.titulo}</dt>
                  {a.descricao && <dd className="text-fg-muted text-base">{a.descricao}</dd>}
                </div>
              ))}
            </dl>
          </section>
        )}

        {c.hotels.length > 0 && !canceled && (
          <section aria-labelledby="hoteis">
            <h2 id="hoteis" className="text-lg font-semibold">
              Hotéis próximos
            </h2>
            <ul className="divide-border border-border mt-3 divide-y rounded-lg border">
              {c.hotels.map((h) => (
                <li key={h.nome} className="flex gap-3 px-4 py-3">
                  <BedDouble className="text-fg-subtle mt-0.5 size-5 shrink-0" />
                  <div className="min-w-0 text-base">
                    <p className="font-medium">
                      {h.link ? (
                        <a
                          href={h.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-text underline-offset-4 hover:underline"
                        >
                          {h.nome}
                        </a>
                      ) : (
                        h.nome
                      )}
                      {h.distancia && (
                        <span className="text-fg-subtle text-sm font-normal"> · {h.distancia}</span>
                      )}
                    </p>
                    {h.endereco && <p className="text-fg-muted text-sm">{h.endereco}</p>}
                    {h.telefone && (
                      <a href={`tel:${h.telefone.replace(/[^\d+]/g, "")}`} className="text-sm">
                        {h.telefone}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function CredentialCard({
  c,
  name,
  company,
  qr,
}: {
  c: Credential;
  name: string;
  company: string;
  qr: string | null;
}) {
  const reg = c.registration;
  const checked = !!reg.checkedInAt;
  return (
    <section
      aria-labelledby="credencial"
      className="border-border bg-surface-raised flex flex-col items-center rounded-xl border px-6 py-7 text-center shadow-sm"
    >
      <h2 id="credencial" className="sr-only">
        Sua credencial de entrada
      </h2>
      {checked && (
        <Badge tone="success" size="md" className="mb-4">
          Presença registrada
        </Badge>
      )}
      {qr && (
        <div
          role="img"
          aria-label={`QR code da entrada de ${name}`}
          className="size-56 rounded-md bg-white p-3 [&_svg]:size-full"
          // SVG gerado no servidor pela biblioteca qrcode, a partir da URL da credencial
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      )}
      <p className="mt-5 text-2xl font-semibold tracking-tight">{name}</p>
      {(company || reg.displayJobTitle) && (
        <p className="text-fg-muted mt-1 text-base">
          {[reg.displayJobTitle, company].filter(Boolean).join(" · ")}
        </p>
      )}
      {reg.category && (
        <Badge tone="neutral" size="md" className="mt-3">
          {reg.category.name}
        </Badge>
      )}
      <p className="text-fg-subtle mt-5 text-sm">Código na recepção</p>
      <p className="tabular font-mono text-2xl font-semibold tracking-[0.2em]">{reg.shortCode}</p>
      <p className="text-fg-subtle mt-4 max-w-xs text-sm">
        Apresente este QR na entrada. Aumente o brilho da tela para agilizar a leitura.
      </p>
    </section>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border flex items-center gap-3 rounded-lg border px-4 py-3">
      <span className="text-brand-text shrink-0 [&_svg]:size-5">{icon}</span>
      <div className="min-w-0">
        <p className="text-fg-subtle text-sm">{label}</p>
        <p className="text-base font-medium">{children}</p>
      </div>
    </div>
  );
}
