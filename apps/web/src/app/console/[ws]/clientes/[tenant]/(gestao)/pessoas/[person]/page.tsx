import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, ShieldX } from "lucide-react";
import { formatCpf, formatPhoneBR, projectTemplate } from "@mais/core";
import { Avatar, Badge, Panel, PanelHeader } from "@/components/ui";
import { termsWithDefaults } from "@/config/terms";
import { guard, requireTenant } from "@/server/auth";
import { tenantDb } from "@/server/tenant-db";
import { STATUS } from "../../../projetos/[project]/inscricoes/status";
import { toDateInput } from "../../projetos/format";
import { EditPerson } from "./edit";

const CONSENT: Record<string, string> = {
  CONTACT_SHARING: "Compartilhar contato no networking",
  MARKETING: "Comunicações de marketing",
  WHATSAPP: "Mensagens por WhatsApp",
  BIOMETRIC: "Reconhecimento facial",
  IMAGE_USE: "Uso de imagem",
};

const dateFmt = (d: Date | null, tz: string) =>
  d
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: tz,
      }).format(d)
    : "—";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 px-5 py-2.5 text-base">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="min-w-0 break-words">{value || <span className="text-fg-faint">—</span>}</dd>
    </div>
  );
}

export default async function PersonPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; person: string }>;
}) {
  const { ws, tenant: slug, person: id } = await params;
  const ctx = await guard(requireTenant(slug));
  const db = tenantDb(ctx);
  const p = await db.person.findFirst({
    where: { id, archivedAt: null },
    include: {
      organizations: { include: { organization: true } },
      registrations: {
        include: { project: true, category: true },
        orderBy: { createdAt: "desc" },
      },
      consents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!p) notFound();
  const t = termsWithDefaults(await db.tenantTerm.findMany());
  const tz = ctx.tenant.timezone;
  const name = `${p.firstName} ${p.lastName}`.trim();
  const latestConsent = new Map<string, (typeof p.consents)[number]>();
  for (const c of p.consents) if (!latestConsent.has(c.purpose)) latestConsent.set(c.purpose, c);
  const canEdit = ["ADMIN", "MANAGER", "OPERATOR"].includes(ctx.role);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={name} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight">{name}</h2>
            <p className="text-fg-subtle truncate text-sm">
              {[p.jobTitle, p.organizations[0]?.organization.name].filter(Boolean).join(" · ") ||
                p.email ||
                "—"}
            </p>
            {p.isMember && (
              <Badge tone="brand" size="sm" className="mt-2">
                {t["member.singular"]}
              </Badge>
            )}
          </div>
        </div>
        {canEdit && (
          <EditPerson
            tenant={slug}
            personId={p.id}
            initial={{
              firstName: p.firstName,
              lastName: p.lastName,
              badgeName: p.badgeName,
              socialName: p.socialName,
              email: p.email,
              phone: p.phone,
              cpf: p.cpf,
              birthDate: toDateInput(p.birthDate, tz),
              nationality: p.nationality,
              jobTitle: p.jobTitle,
              city: p.city,
              state: p.state,
              passportNumber: p.passportNumber,
              passportExpiry: toDateInput(p.passportExpiry, tz),
              rg: p.rg,
              dietary: p.dietary,
              medicalNotes: p.medicalNotes,
              emergencyName: p.emergencyName,
              emergencyPhone: p.emergencyPhone,
            }}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Dados pessoais" />
          <dl className="pb-3">
            <Row label="Nome no crachá" value={p.badgeName} />
            <Row label="Nome social" value={p.socialName} />
            <Row label="E-mail" value={p.email} />
            <Row label="WhatsApp" value={p.phone ? formatPhoneBR(p.phone) : ""} />
            <Row label="CPF" value={p.cpf ? formatCpf(p.cpf) : ""} />
            <Row label="Nascimento" value={p.birthDate ? dateFmt(p.birthDate, tz) : ""} />
            <Row label="Cidade" value={[p.city, p.state].filter(Boolean).join(" · ")} />
          </dl>
        </Panel>

        <Panel>
          <PanelHeader title="Documentos de viagem" />
          <dl className="pb-3">
            <Row label="Passaporte" value={p.passportNumber} />
            <Row label="Validade" value={p.passportExpiry ? dateFmt(p.passportExpiry, tz) : ""} />
            <Row label="RG" value={p.rg} />
            <Row label="Nacionalidade" value={p.nationality} />
          </dl>
        </Panel>

        <Panel>
          <PanelHeader
            title="Saúde e emergência"
            description="Visível só para a equipe do cliente."
          />
          <dl className="pb-3">
            <Row label="Alimentação" value={p.dietary} />
            <Row label="Observações" value={p.medicalNotes} />
            <Row label="Contato" value={p.emergencyName} />
            <Row label="Telefone" value={p.emergencyPhone ? formatPhoneBR(p.emergencyPhone) : ""} />
          </dl>
        </Panel>

        <Panel>
          <PanelHeader
            title="Consentimentos (LGPD)"
            description="Último registro de cada finalidade."
          />
          {latestConsent.size === 0 ? (
            <p className="text-fg-subtle px-5 pb-5 text-sm">Nenhum consentimento registrado.</p>
          ) : (
            <ul className="divide-border divide-y">
              {[...latestConsent.values()].map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-base">
                  {c.granted ? (
                    <ShieldCheck className="text-success size-4" />
                  ) : (
                    <ShieldX className="text-fg-subtle size-4" />
                  )}
                  <span className="min-w-0 flex-1">
                    {CONSENT[c.purpose] ?? c.purpose}
                    <span className="text-fg-subtle block text-xs">
                      {c.granted ? "Autorizado" : "Não autorizado"} em {dateFmt(c.createdAt, tz)} ·{" "}
                      {c.source || "—"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Participações"
          description={`${p.registrations.length} ${p.registrations.length === 1 ? "projeto" : "projetos"}`}
        />
        {p.registrations.length === 0 ? (
          <p className="text-fg-subtle px-5 pb-5 text-sm">
            Ainda não participou de nenhum projeto.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {p.registrations.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/console/${ws}/clientes/${slug}/projetos/${r.project.slug}/inscricoes?q=${encodeURIComponent(p.firstName)}`}
                  className="hover:bg-surface-muted flex items-center gap-3 px-5 py-3 transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium">{r.project.name}</span>
                    <span className="text-fg-subtle block truncate text-sm">
                      {projectTemplate(r.project.type).name}
                      {r.category ? ` · ${r.category.name}` : ""}
                    </span>
                  </span>
                  <Badge tone={STATUS[r.status].tone} size="sm" dot>
                    {STATUS[r.status].label}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
