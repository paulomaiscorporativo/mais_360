import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BedDouble, CalendarRange, Plane } from "lucide-react";
import { Avatar } from "@/components/ui";
import { resolvePublicTenant } from "@/server/tenant-resolve";
import { PortalLinkForm } from "./link-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}): Promise<Metadata> {
  const tenant = await resolvePublicTenant((await params).tenantSlug);
  return {
    title: { absolute: tenant ? `Portal do viajante · ${tenant.name}` : "Portal do viajante" },
    robots: { index: false },
  };
}

/** Entrada do portal: quem perdeu o link pede um novo pelo e-mail cadastrado. */
export default async function PortalEntryPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await resolvePublicTenant(tenantSlug);
  if (!tenant) notFound();
  const logo = tenant.branding?.logoFileId ? `/api/files/${tenant.branding.logoFileId}` : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="bg-brand text-brand-fg relative overflow-hidden px-6 pt-8 pb-12 sm:mt-8 sm:rounded-t-lg sm:px-10">
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
        <h1 className="font-display relative mt-10 text-[40px] leading-[1.05] tracking-[-0.01em]">
          Sua viagem, na palma da mão.
        </h1>
        <ul className="relative mt-6 flex flex-col gap-2.5 text-base opacity-90">
          <li className="flex items-center gap-3">
            <Plane className="size-4 shrink-0" /> Voos com localizador e status ao vivo
          </li>
          <li className="flex items-center gap-3">
            <BedDouble className="size-4 shrink-0" /> Hotel, quarto e com quem você divide
          </li>
          <li className="flex items-center gap-3">
            <CalendarRange className="size-4 shrink-0" /> Roteiro, avisos, documentos e vouchers
          </li>
        </ul>
      </header>
      <main className="bg-surface flex-1 px-6 py-8 sm:mb-8 sm:rounded-b-lg sm:px-10">
        <h2 className="text-xl font-semibold tracking-tight">Receber meu link de acesso</h2>
        <p className="text-fg-muted text-md mt-2">
          O acesso é pelo link pessoal enviado pela equipe. Perdeu? Informe o e-mail da sua
          inscrição e enviamos de novo.
        </p>
        <PortalLinkForm tenantSlug={tenantSlug} />
      </main>
    </div>
  );
}
