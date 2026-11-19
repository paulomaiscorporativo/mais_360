"use client";

import {
  Archive,
  Copy,
  FileText,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Badge, Button, EmptyState, Input } from "@/components/ui";
import {
  ConfirmDialog,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import {
  archiveTemplate,
  duplicateTemplate,
} from "@/app/console/[ws]/clientes/[tenant]/comunicacao/actions";
import { fmtRelative, PURPOSE_LABEL } from "./labels";
import { cn } from "@/lib/cn";

export type TemplateRow = {
  id: string;
  name: string;
  purpose: string;
  scope: string | null;
  hasEmail: boolean;
  hasWhatsapp: boolean;
  preview: string;
  uses: number;
  lastUsedAt: string | null;
  updatedAt: string;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function TemplateList({
  tenant,
  base,
  templates,
  canEdit,
}: {
  tenant: string;
  base: string;
  templates: TemplateRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [archiving, setArchiving] = useState<TemplateRow | null>(null);
  const [pending, start] = useTransition();
  const shown = useMemo(
    () => templates.filter((t) => !q || norm(`${t.name} ${t.preview}`).includes(norm(q))),
    [templates, q],
  );

  const duplicate = (t: TemplateRow) =>
    start(async () => {
      const r = await duplicateTemplate({ tenant, id: t.id });
      if (r.ok) {
        toast.success("Cópia criada.");
        router.push(`${base}/modelos/${r.data.id}`);
      } else toast.error(r.error);
    });

  const archive = () =>
    start(async () => {
      if (!archiving) return;
      const r = await archiveTemplate({ tenant, id: archiving.id });
      if (r.ok) {
        toast.success(`“${archiving.name}” foi arquivado.`);
        setArchiving(null);
        router.refresh();
      } else toast.error(r.error);
    });

  if (!templates.length) {
    return (
      <EmptyState
        icon={<FileText />}
        title="Escreva o primeiro modelo"
        description="Convites, lembretes e boas-vindas escritos uma vez e reaproveitados em todos os envios — com o nome de cada pessoa no lugar certo."
        action={
          canEdit && (
            <Button asChild>
              <Link href={`${base}/modelos/novo`}>
                <Plus /> Novo modelo
              </Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          leading={<Search />}
          placeholder="Buscar modelo"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:w-72"
          aria-label="Buscar modelo"
        />
        {canEdit && (
          <Button asChild>
            <Link href={`${base}/modelos/novo`}>
              <Plus /> Novo modelo
            </Link>
          </Button>
        )}
      </div>

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((t) => (
          <li
            key={t.id}
            className="border-border bg-surface hover:border-border-strong group relative flex flex-col rounded-md border shadow-sm transition-colors"
          >
            <Link
              href={`${base}/modelos/${t.id}`}
              className="flex flex-1 flex-col gap-3 p-4 pr-12 after:absolute after:inset-0 focus-visible:outline-none"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{t.name}</p>
                <p className="text-fg-subtle mt-0.5 text-xs">
                  {PURPOSE_LABEL[t.purpose] ?? t.purpose}
                  {t.scope && ` · só em ${t.scope}`}
                </p>
              </div>
              <p className="text-fg-muted line-clamp-2 text-sm leading-relaxed">
                {t.preview || <span className="text-fg-faint">Sem texto ainda</span>}
              </p>
            </Link>
            <div className="border-border text-fg-subtle flex items-center gap-2 border-t px-4 py-2.5 text-xs">
              <span
                className={cn("inline-flex items-center gap-1", !t.hasEmail && "opacity-35")}
                title={t.hasEmail ? "Tem versão de e-mail" : "Sem versão de e-mail"}
              >
                <Mail className="size-3.5" /> E-mail
              </span>
              <span
                className={cn("inline-flex items-center gap-1", !t.hasWhatsapp && "opacity-35")}
                title={t.hasWhatsapp ? "Tem versão de WhatsApp" : "WhatsApp usa o texto do e-mail"}
              >
                <MessageCircle className="size-3.5" /> WhatsApp
              </span>
              <span className="ml-auto">
                {t.uses > 0 ? (
                  <Badge size="sm">
                    <Send className="size-3" /> {t.uses} envio{t.uses > 1 ? "s" : ""}
                  </Badge>
                ) : (
                  `editado ${fmtRelative(t.updatedAt)}`
                )}
              </span>
            </div>
            {canEdit && (
              <div className="absolute top-3 right-3 z-[1]">
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${t.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem asChild>
                      <Link href={`${base}/campanhas/nova?modelo=${t.id}`}>
                        <Send /> Enviar agora
                      </Link>
                    </MenuItem>
                    <MenuItem onSelect={() => duplicate(t)} disabled={pending}>
                      <Copy /> Duplicar
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem tone="danger" onSelect={() => setArchiving(t)}>
                      <Archive /> Arquivar
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            )}
          </li>
        ))}
      </ul>
      {shown.length === 0 && (
        <p className="text-fg-subtle py-8 text-center text-sm">Nenhum modelo com “{q}”.</p>
      )}

      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={`Arquivar “${archiving?.name ?? ""}”?`}
        description="O modelo some da lista e não pode ser usado em novos envios. Envios já feitos com ele continuam no histórico."
        confirmLabel="Arquivar modelo"
        tone="danger"
        loading={pending}
        onConfirm={archive}
      />
    </div>
  );
}
