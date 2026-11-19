import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { canCompanyChangeGuest, canCompanyRegister, inviteStatus } from "@mais/core";
import { Avatar } from "@/components/ui";
import { formatPeriod } from "@/app/console/[ws]/clientes/[tenant]/(gestao)/projetos/format";
import { currentCompany } from "@/server/company-portal";
import { eventSettings } from "@/server/events";
import { resolvePublicTenant } from "@/server/tenant-resolve";
import { CompanyLogin } from "./login";
import { CompanyPortalView, type PortalGuest } from "./portal";

export const metadata: Metadata = {
  title: { absolute: "Área da empresa convidada" },
  robots: { index: false, follow: false },
};

/**
 * Portal da empresa convidante (<cliente>/empresa). Sem sessão, mostra a
 * entrada; com sessão, a cota e os convidados da própria empresa.
 */
export default async function CompanyPortalPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await resolvePublicTenant(tenantSlug);
  if (!tenant || tenant.status !== "ACTIVE") notFound();
  const c = await currentCompany(tenantSlug);
  const logo = tenant.branding?.logoFileId ? `/api/files/${tenant.branding.logoFileId}` : null;

  let body: React.ReactNode;
  let title: string | null = null;
  let period: string | null = null;
  if (!c) body = <CompanyLogin tenantSlug={tenantSlug} />;
  else {
    const tz = c.project.timezone ?? tenant.timezone;
    title = c.project.name;
    period = c.project.startsAt ? formatPeriod(c.project.startsAt, c.project.endsAt, tz) : null;
    const [settings, invites] = await Promise.all([
      eventSettings(c.db, c.project.id),
      c.db.eventInvite.findMany({
        where: { projectId: c.project.id, companyQuotaId: c.company.id },
        orderBy: { createdAt: "asc" },
        include: {
          registration: {
            include: { person: true, seat: { include: { table: { select: { number: true } } } } },
          },
        },
      }),
    ]);
    const now = new Date();
    const active = invites.filter((i) => i.registration.status !== "CANCELED");
    const check = canCompanyRegister(
      { quota: c.company.quota, used: active.length, lockedAt: c.company.lockedAt },
      settings.inviteDeadline,
      now,
    );
    // Cota cheia não fecha o portal: ainda dá para substituir e acompanhar
    const open = check.ok || check.reason === "FULL";
    const guests: PortalGuest[] = invites.map((i) => {
      const r = i.registration;
      return {
        id: r.id,
        name: `${r.person.firstName} ${r.person.lastName}`.trim(),
        email: r.person.email,
        phone: r.person.phone,
        jobTitle: r.displayJobTitle || r.person.jobTitle,
        status: inviteStatus({ ...r, sentAt: i.sentAt }),
        responsible: i.kind === "RESPONSIBLE",
        table: r.seat ? `Mesa ${r.seat.table.number}` : "",
        changeable: canCompanyChangeGuest(
          c.company,
          { ...r, companyQuotaId: i.companyQuotaId, kind: i.kind },
          settings.inviteDeadline,
          now,
        ).ok,
      };
    });
    body = (
      <CompanyPortalView
        tenantSlug={tenantSlug}
        companyName={c.company.companyName}
        contactName={c.company.contactName}
        quota={c.company.quota}
        used={active.length}
        open={open}
        closedReason={open ? null : check.ok ? null : check.message}
        deadline={
          settings.inviteDeadline
            ? new Intl.DateTimeFormat("pt-BR", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: tz,
              }).format(settings.inviteDeadline)
            : null
        }
        provisional={!c.company.passwordChangedAt}
        guests={guests}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="bg-brand text-brand-fg relative overflow-hidden px-6 pt-8 pb-8 sm:mt-8 sm:rounded-t-lg sm:px-10">
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
        {title && (
          <>
            <h1 className="font-display relative mt-6 text-[30px] leading-[1.1] tracking-[-0.01em] sm:text-[36px]">
              {title}
            </h1>
            {period && (
              <p className="relative mt-3 flex items-center gap-2 text-base opacity-90">
                <CalendarDays className="size-4 shrink-0" /> {period}
              </p>
            )}
          </>
        )}
      </header>
      <main className="bg-surface flex-1 px-6 py-8 sm:mb-8 sm:rounded-b-lg sm:border sm:border-t-0 sm:px-10">
        {body}
      </main>
    </div>
  );
}
