import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Mail, MessageCircle, Plus, Send } from "lucide-react";
import { Badge, Button, Panel, PanelHeader, Stat } from "@/components/ui";
import { CampaignProgress } from "@/components/communication/campaign-progress";
import { CAMPAIGN_STATUS, CHANNEL_LABEL, fmtDateTime } from "@/components/communication/labels";
import { guard } from "@/server/auth";
import {
  communicationBase,
  globalChannelsInfo,
  requireCommunication,
} from "@/server/communication";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Comunicação" };

const nf = new Intl.NumberFormat("pt-BR");

export default async function CommunicationOverview({
  params,
}: {
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant } = await params;
  const ctx = await guard(requireCommunication(tenant));
  const base = communicationBase(ws, tenant);
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [channels, templates, active, recent, byStatus] = await Promise.all([
    ctx.db.messagingChannel.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    ctx.db.messageTemplate.count({ where: { archivedAt: null } }),
    ctx.db.messageCampaign.findMany({
      where: { status: { in: ["RUNNING", "WAITING_WINDOW", "SCHEDULED", "PAUSED"] } },
      orderBy: { createdAt: "desc" },
    }),
    ctx.db.messageCampaign.findMany({
      where: { status: { in: ["COMPLETED", "CANCELED", "FAILED"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    ctx.db.messageDelivery.groupBy({
      by: ["channel", "status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const g = globalChannelsInfo();
  const email = channels.find((c) => c.kind === "EMAIL" && !c.projectId);
  const whatsapp = channels.find((c) => c.kind === "WHATSAPP" && !c.projectId);
  const emailReady = !!email || !!g.email;
  const whatsappReady = !!whatsapp || !!g.evolution?.instance;

  const count = (channel: "EMAIL" | "WHATSAPP", statuses: string[]) =>
    byStatus
      .filter((r) => r.channel === channel && statuses.includes(r.status))
      .reduce((s, r) => s + r._count._all, 0);
  const SENT = ["SENT", "DELIVERED", "READ"];
  const emailSent = count("EMAIL", SENT);
  const waSent = count("WHATSAPP", SENT);
  const waRead = count("WHATSAPP", ["READ"]);
  const failures = count("EMAIL", ["FAILED"]) + count("WHATSAPP", ["FAILED"]);

  const steps = [
    { done: emailReady || whatsappReady, label: "Conecte um canal", href: `${base}/canais` },
    { done: templates > 0, label: "Escreva um modelo", href: `${base}/modelos/novo` },
    {
      done: active.length + recent.length > 0,
      label: "Faça o primeiro envio",
      href: `${base}/campanhas/nova`,
    },
  ];
  const onboarding = steps.some((s) => !s.done);

  return (
    <div className="flex flex-col gap-6">
      {onboarding && (
        <Panel className="overflow-hidden">
          <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="border-border flex flex-col justify-center gap-2 border-b p-6 md:border-r md:border-b-0">
              <p className="font-display text-[28px] leading-tight tracking-tight">
                Comunicação com a marca do cliente, do convite ao pós-evento.
              </p>
              <p className="text-fg-muted text-base">
                Três passos para o primeiro envio. O WhatsApp segue um ritmo humano para proteger o
                número.
              </p>
            </div>
            <ol className="divide-border divide-y">
              {steps.map((s, i) => (
                <li key={s.label}>
                  <Link
                    href={s.href}
                    className="hover:bg-surface-muted group flex items-center gap-4 px-6 py-4 transition-colors"
                  >
                    <span
                      className={cn(
                        "tabular grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                        s.done
                          ? "border-success-border bg-success-bg text-success"
                          : "border-border-strong text-fg-muted",
                      )}
                    >
                      {s.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                    </span>
                    <span
                      className={cn("flex-1 font-medium", s.done && "text-fg-subtle line-through")}
                    >
                      {s.label}
                    </span>
                    <ArrowRight className="text-fg-faint group-hover:text-fg size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </Panel>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <ChannelCard
          icon={<Mail />}
          title="E-mail"
          href={`${base}/canais`}
          ready={emailReady}
          detail={
            email
              ? `${email.fromName || email.name}${email.fromEmail ? ` · ${email.fromEmail}` : ""}`
              : g.email
                ? `Servidor da plataforma · ${g.email.from}`
                : "Nenhum servidor configurado"
          }
          source={email ? (email.smtpHost ? "Servidor próprio" : "Remetente próprio") : g.email ? "Padrão" : null}
        />
        <ChannelCard
          icon={<MessageCircle />}
          title="WhatsApp"
          href={`${base}/canais`}
          ready={whatsappReady}
          detail={
            whatsapp
              ? `${whatsapp.name}${whatsapp.waNumber ? ` · ${whatsapp.waNumber}` : ""}`
              : g.evolution?.instance
                ? "Número padrão da plataforma"
                : "Nenhum número conectado"
          }
          source={whatsapp ? "Número próprio" : g.evolution?.instance ? "Padrão" : null}
        />
      </div>

      <Panel>
        <div className="divide-border grid grid-cols-2 divide-x divide-y md:grid-cols-4 md:divide-y-0">
          <Stat className="p-5" label="E-mails enviados" value={nf.format(emailSent)} hint="últimos 30 dias" />
          <Stat className="p-5" label="WhatsApp enviados" value={nf.format(waSent)} hint="últimos 30 dias" />
          <Stat
            className="p-5"
            label="Leitura no WhatsApp"
            value={waSent ? `${Math.round((waRead / waSent) * 100)}%` : "—"}
            hint="das mensagens enviadas"
          />
          <Stat
            className="p-5"
            label="Falhas"
            value={nf.format(failures)}
            hint={failures ? "veja o detalhe nos envios" : "nenhuma no período"}
          />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            title="Em andamento"
            description="Envios saindo agora ou aguardando o horário permitido."
            actions={
              <Button asChild size="sm">
                <Link href={`${base}/campanhas/nova`}>
                  <Plus /> Novo envio
                </Link>
              </Button>
            }
          />
          {active.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <Send className="text-fg-faint size-5" />
              <p className="text-fg-muted text-sm">Nada saindo agora.</p>
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {active.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`${base}/campanhas/${c.id}`}
                    className="hover:bg-surface-muted flex flex-col gap-3 px-5 py-4 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-medium">{c.name}</span>
                      <Badge size="sm" tone={CAMPAIGN_STATUS[c.status]?.tone} dot>
                        {CAMPAIGN_STATUS[c.status]?.label}
                      </Badge>
                    </div>
                    <CampaignProgress sent={c.sent} failed={c.failed} total={c.total} />
                    <p className="text-fg-subtle text-xs">
                      {CHANNEL_LABEL[c.channel]} · {c.statusReason || `próximo envio ${fmtDateTime(c.nextSendAt)}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Últimos envios"
            actions={
              <Button asChild size="sm" variant="ghost">
                <Link href={`${base}/campanhas`}>
                  Ver todos <ArrowRight />
                </Link>
              </Button>
            }
          />
          {recent.length === 0 ? (
            <p className="text-fg-subtle px-5 py-10 text-center text-sm">
              O histórico aparece aqui depois do primeiro envio.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {recent.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`${base}/campanhas/${c.id}`}
                    className="hover:bg-surface-muted flex items-center gap-3 px-5 py-3 transition-colors"
                  >
                    <span className="text-fg-subtle [&_svg]:size-4">
                      {c.channel === "EMAIL" ? <Mail /> : <MessageCircle />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="text-fg-subtle block text-xs">
                        {fmtDateTime(c.finishedAt ?? c.createdAt)}
                      </span>
                    </span>
                    <span className="tabular text-fg-muted text-sm">
                      {nf.format(c.sent)}/{nf.format(c.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ChannelCard({
  icon,
  title,
  detail,
  ready,
  source,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  ready: boolean;
  source: string | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="border-border bg-surface hover:border-border-strong group flex items-center gap-4 rounded-md border p-4 shadow-sm transition-colors"
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-md [&_svg]:size-5",
          ready ? "bg-brand-subtle text-brand-subtle-fg" : "bg-surface-sunken text-fg-faint",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{title}</span>
          {ready ? (
            <Badge size="sm" tone="success" dot>
              Pronto
            </Badge>
          ) : (
            <Badge size="sm" tone="warning" dot>
              Configurar
            </Badge>
          )}
          {source && <span className="text-fg-faint text-xs">{source}</span>}
        </div>
        <p className="text-fg-subtle mt-0.5 truncate text-sm">{detail}</p>
      </div>
      <ArrowRight className="text-fg-faint group-hover:text-fg size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
