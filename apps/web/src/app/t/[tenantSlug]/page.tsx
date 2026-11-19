import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Mail, MessageCircle, QrCode } from "lucide-react";
import { Avatar } from "@/components/ui";
import { LoginForm } from "@/app/(auth)/entrar/login-form";
import { termsWithDefaults } from "@/config/terms";
import { prisma } from "@/server/db";
import { resolveBrand } from "@/server/brand";
import { modulesForTenant } from "@/server/modules";
import { tenantPublicBase } from "@/server/public-links";
import { resolvePublicTenant } from "@/server/tenant-resolve";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}): Promise<Metadata> {
  const tenant = await resolvePublicTenant((await params).tenantSlug);
  // Página do cliente: o título é a marca dele (sem o sufixo do produto).
  return { title: { absolute: tenant?.name ?? "Página não encontrada" } };
}

export default async function TenantHome({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const tenant = await resolvePublicTenant((await params).tenantSlug);
  if (!tenant) notFound();
  const brand = resolveBrand(tenant);
  const t = termsWithDefaults(await prisma.tenantTerm.findMany({ where: { tenantId: tenant.id } }));
  const consolePath = `/console/${tenant.workspace.slug}/clientes/${tenant.slug}`;
  const memberArea = (await modulesForTenant(tenant)).has("CORPORATE_TRAVEL")
    ? `${await tenantPublicBase(tenant)}/viagens`
    : null;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Marca do cliente */}
      <section className="bg-brand text-brand-fg relative flex flex-col justify-between overflow-hidden px-6 py-8 sm:px-12 sm:py-12">
        <div className="pointer-events-none absolute -top-24 -right-24 size-[420px] rounded-full border border-current opacity-[0.08]" />
        <div className="pointer-events-none absolute -top-8 -right-8 size-[260px] rounded-full border border-current opacity-[0.08]" />
        <header className="relative flex items-center gap-3">
          <Avatar name={tenant.name} size="md" square className="bg-white/15 text-current ring-0" />
          <span className="text-md font-semibold tracking-tight">{tenant.name}</span>
        </header>
        <div className="relative my-16 max-w-lg lg:my-0">
          <p className="text-sm font-medium tracking-[0.16em] uppercase opacity-70">
            Viagens e eventos
          </p>
          <h1 className="font-display mt-4 text-[44px] leading-[1.05] tracking-[-0.01em] sm:text-[56px]">
            Tudo sobre a sua participação, em um só lugar.
          </h1>
          <ul className="mt-10 flex flex-col gap-4 text-base opacity-90">
            <li className="flex items-start gap-3">
              <Mail className="mt-0.5 size-4 shrink-0" />
              Convites e confirmações chegam por e-mail com link direto.
            </li>
            <li className="flex items-start gap-3">
              <MessageCircle className="mt-0.5 size-4 shrink-0" />
              Lembretes e avisos importantes também pelo WhatsApp.
            </li>
            <li className="flex items-start gap-3">
              <QrCode className="mt-0.5 size-4 shrink-0" />
              No dia, apresente o QR code do seu convite ou credencial.
            </li>
          </ul>
        </div>
        <footer className="relative text-xs opacity-60">
          {brand.productName ? `operado por ${brand.productName}` : tenant.legalName || tenant.name}
        </footer>
      </section>

      {/* Acesso da equipe */}
      <section className="flex items-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-[380px]">
          <h2 className="text-2xl font-semibold tracking-tight">Acesso da equipe</h2>
          <p className="text-md text-fg-muted mt-2">
            Para quem organiza e opera os eventos de {tenant.name}. {t["member.plural"]} e
            participantes recebem o acesso pelo próprio convite.
          </p>
          <LoginForm next={consolePath} />
          {memberArea && (
            <a
              href={memberArea}
              className="border-border hover:border-fg-faint/60 focus-visible:outline-brand-ring mt-8 flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-base transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span>
                <span className="block font-medium">
                  Área do {t["member.singular"].toLowerCase()}
                </span>
                <span className="text-fg-muted text-sm">Peça viagens e acompanhe as cotações.</span>
              </span>
              <ArrowRight className="text-fg-subtle size-4 shrink-0" />
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
