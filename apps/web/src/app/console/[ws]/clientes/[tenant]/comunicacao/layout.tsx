import { MessagesSquare } from "lucide-react";
import { Badge } from "@/components/ui";
import { CommunicationNav } from "@/components/communication/subnav";
import { PRODUCT } from "@/config/product";
import { guard } from "@/server/auth";
import { communicationBase, requireCommunication } from "@/server/communication";

export default async function CommunicationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant } = await params;
  const ctx = await guard(requireCommunication(tenant));
  const [running, templates] = await Promise.all([
    ctx.db.messageCampaign.count({
      where: { status: { in: ["RUNNING", "WAITING_WINDOW", "SCHEDULED", "PAUSED"] } },
    }),
    ctx.db.messageTemplate.count({ where: { archivedAt: null } }),
  ]);
  const base = communicationBase(ws, tenant);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-brand-subtle text-brand-subtle-fg grid size-9 shrink-0 place-items-center rounded-md [&_svg]:size-[18px]">
            <MessagesSquare />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-md font-semibold tracking-tight">Comunicação</h2>
              <Badge size="sm">{PRODUCT.lines.connect}</Badge>
            </div>
            <p className="text-fg-subtle text-sm">E-mail e WhatsApp com a marca do cliente.</p>
          </div>
        </div>
        <CommunicationNav
          base={base}
          items={[
            { href: "", label: "Visão geral", exact: true },
            { href: "campanhas", label: "Envios", count: running },
            { href: "modelos", label: "Modelos", count: templates },
            { href: "reguas", label: "Réguas" },
            { href: "canais", label: "Canais" },
          ]}
        />
      </div>
      {children}
    </div>
  );
}
