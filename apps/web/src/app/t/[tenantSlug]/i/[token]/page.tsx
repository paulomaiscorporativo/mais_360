import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { enabledProjectFeatures, readProjectSettings } from "@mais/core";
import { Avatar } from "@/components/ui";
import { formatPeriod } from "@/app/console/[ws]/clientes/[tenant]/(gestao)/projetos/format";
import { modulesForTenant } from "@/server/modules";
import { tenantPublicBase } from "@/server/public-links";
import { tenantDb } from "@/server/tenant-db";
import { resolvePublicTenant } from "@/server/tenant-resolve";
import { PublicRegistrationForm } from "./form";

async function load(tenantSlug: string, token: string) {
  const tenant = await resolvePublicTenant(tenantSlug);
  if (!tenant || tenant.status !== "ACTIVE") return null;
  const db = tenantDb({ tenantId: tenant.id });
  const project = await db.project.findFirst({
    where: { publicToken: token, archivedAt: null },
    include: { features: true },
  });
  if (!project) return null;
  const features = enabledProjectFeatures(project.features, await modulesForTenant(tenant));
  if (!features.has("REGISTRATION_FORM")) return null;
  return { tenant, project, features };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string; token: string }>;
}): Promise<Metadata> {
  const { tenantSlug, token } = await params;
  const d = await load(tenantSlug, token);
  return {
    title: { absolute: d ? `Inscrição · ${d.project.name}` : "Inscrição" },
    robots: { index: false },
  };
}

export default async function PublicRegistrationPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; token: string }>;
}) {
  const { tenantSlug, token } = await params;
  const d = await load(tenantSlug, token);
  if (!d) notFound();
  const { tenant, project, features } = d;
  const form = readProjectSettings(project.settings).form;
  const tz = project.timezone ?? tenant.timezone;
  const logo = tenant.branding?.logoFileId ? `/api/files/${tenant.branding.logoFileId}` : null;
  const banner = project.bannerFileId ? `/api/files/${project.bannerFileId}` : null;
  const base = await tenantPublicBase(tenant);

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
        <h1 className="font-display relative mt-8 text-[34px] leading-[1.08] tracking-[-0.01em] sm:text-[42px]">
          {project.name}
        </h1>
        <ul className="relative mt-5 flex flex-col gap-2 text-base opacity-90">
          {project.startsAt && (
            <li className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0" />
              {formatPeriod(project.startsAt, project.endsAt, tz)}
            </li>
          )}
          {(project.venueName || project.destination) && (
            <li className="flex items-start gap-2">
              <MapPin className="mt-1 size-4 shrink-0" />
              <span>
                {project.venueName || project.destination}
                {project.venueAddress && (
                  <span className="block text-sm opacity-80">{project.venueAddress}</span>
                )}
              </span>
            </li>
          )}
        </ul>
      </header>

      <main className="bg-surface flex-1 px-6 py-8 sm:mb-8 sm:rounded-b-lg sm:border sm:border-t-0 sm:px-10">
        {!form.open ? (
          <div className="py-10 text-center">
            <p className="text-lg font-semibold">As inscrições estão encerradas</p>
            <p className="text-fg-muted mt-2 text-base">
              Se você já se inscreveu, sua credencial está no e-mail e no WhatsApp cadastrados.
            </p>
          </div>
        ) : (
          <PublicRegistrationForm
            tenantSlug={tenantSlug}
            token={token}
            welcome={form.welcome}
            successMessage={form.successMessage}
            fields={{
              cpf: form.askCpf,
              cpfRequired: form.requireCpf,
              company: form.askCompany,
              jobTitle: form.askJobTitle,
              city: form.askCity,
              contactSharing: form.askContactSharing && features.has("NETWORKING"),
            }}
            credentialBase={`${base}/c/`}
            tenantName={tenant.name}
          />
        )}
      </main>
    </div>
  );
}
