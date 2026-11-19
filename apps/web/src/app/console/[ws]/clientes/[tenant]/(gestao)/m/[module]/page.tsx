import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, FolderPlus } from "lucide-react";
import { MODULES } from "@mais/core";
import { Badge, EmptyState, Panel, PanelHeader } from "@/components/ui";
import { MODULE_UI, moduleBySlug, moduleHref, moduleLine } from "@/config/modules-ui";
import { guard, requireTenant } from "@/server/auth";
import { prisma } from "@/server/db";
import { modulesForTenant } from "@/server/modules";

const FEATURE_LABEL: Record<string, string> = {
  REGISTRATION_FORM: "Formulário público de inscrição",
  INVITES: "Empresas com cota e convites digitais",
  TABLES: "Mapa de mesas",
  ACCREDITATION: "Balcão, etiquetas e check-in",
  SELF_SERVICE: "Totens de autoatendimento",
  FACE_RECOGNITION: "Reconhecimento facial",
  ACCESS_CONTROL: "Controle de acesso por área",
  NETWORKING: "Networking entre participantes",
  FLIGHTS: "Voos e localizadores",
  ACCOMMODATION: "Hospedagem e rooming list",
  ITINERARY: "Cronograma dia a dia",
  CHECKLIST: "Checklist operacional",
  MURAL: "Mural de recados",
  SUPPORT: "Suporte ao viajante",
  DOCUMENTS: "Documentos",
  VOUCHERS: "Vouchers personalizados",
  STANDS: "Mapa de stands e cotas",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ module: string }>;
}): Promise<Metadata> {
  const key = moduleBySlug((await params).module);
  return { title: key ? MODULES[key].name : "Módulo" };
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; module: string }>;
}) {
  const { ws, tenant: slug, module } = await params;
  const key = moduleBySlug(module);
  if (!key) notFound();
  // Módulos com telas próprias: a página genérica só redireciona
  if (MODULE_UI[key].path) redirect(moduleHref(`/console/${ws}/clientes/${slug}`, key));
  const ctx = await guard(requireTenant(slug));
  const active = await modulesForTenant(ctx.tenant);
  // Módulo não contratado não existe para o cliente (checagem no servidor, não só na tela).
  if (!active.has(key)) notFound();

  const def = MODULES[key];
  const Icon = MODULE_UI[key].icon;
  const grant = await prisma.tenantModule.findUnique({
    where: { tenantId_module: { tenantId: ctx.tenantId, module: key } },
  });
  const line = moduleLine(key);
  const dateFmt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex items-start gap-4">
          <span className="bg-brand-subtle text-brand-subtle-fg grid size-12 shrink-0 place-items-center rounded-md [&_svg]:size-6">
            <Icon />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{def.name}</h2>
              {line && <Badge size="sm">{line}</Badge>}
            </div>
            <p className="text-fg-muted mt-1 max-w-xl text-base">{def.summary}</p>
          </div>
        </div>
        <EmptyState
          icon={<FolderPlus />}
          title="Os projetos deste módulo aparecem aqui"
          description="A operação do módulo (projetos, inscrições e envios) está sendo migrada dos sistemas atuais para esta plataforma."
        />
      </div>
      <Panel>
        <PanelHeader title="Contrato" />
        <dl className="divide-border divide-y text-base">
          <div className="flex justify-between gap-4 px-5 py-3">
            <dt className="text-fg-subtle">Situação</dt>
            <dd>
              <Badge tone="success" dot>
                Ativo
              </Badge>
            </dd>
          </div>
          {grant && (
            <div className="flex justify-between gap-4 px-5 py-3">
              <dt className="text-fg-subtle">Desde</dt>
              <dd>{dateFmt.format(grant.validFrom)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4 px-5 py-3">
            <dt className="text-fg-subtle">Vigência</dt>
            <dd>{grant?.validUntil ? `até ${dateFmt.format(grant.validUntil)}` : "Sem prazo"}</dd>
          </div>
        </dl>
        {def.features.length > 0 && (
          <div className="border-border border-t px-5 py-4">
            <p className="text-fg-subtle mb-3 text-xs font-medium">Recursos incluídos</p>
            <ul className="flex flex-col gap-2 text-sm">
              {def.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <CheckCircle2 className="text-success size-4" />
                  {FEATURE_LABEL[f] ?? f}
                </li>
              ))}
            </ul>
          </div>
        )}
        {def.requires.length > 0 && (
          <p className="border-border text-fg-subtle border-t px-5 py-3 text-xs">
            Usa {def.requires.map((r) => MODULES[r].name).join(" e ")}.
          </p>
        )}
      </Panel>
    </div>
  );
}
