"use client";

import { CheckCheck, Monitor, Smartphone, UserRound } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";

export type PreviewData = {
  subject: string;
  html: string;
  whatsapp: string;
  sample: { name: string; fictitious: boolean };
  unknownFields: string[];
};

/** Formatação do WhatsApp (*negrito*, _itálico_, ~riscado~, ```mono```) com texto escapado. */
function whatsappHtml(text: string): string {
  const esc = text.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
  return esc
    .replace(/```([\s\S]+?)```/g, '<code class="font-mono text-[0.92em]">$1</code>')
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,!?:;]|$)/g, "$1<strong>$2</strong>")
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])~(?!\s)([^~\n]+?)~(?=[\s).,!?:;]|$)/g, "$1<s>$2</s>")
    .replace(
      /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
      '<span class="text-[#027eb5] underline decoration-[#027eb5]/40 break-all">$1</span>',
    );
}

const now = () =>
  new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date());

export function MessagePreview({
  data,
  loading,
  fromLabel,
  channels = ["EMAIL", "WHATSAPP"],
  defaultTab,
  className,
}: {
  data: PreviewData | null;
  loading?: boolean;
  fromLabel: string;
  channels?: ("EMAIL" | "WHATSAPP")[];
  defaultTab?: "EMAIL" | "WHATSAPP";
  className?: string;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const initial = defaultTab ?? channels[0] ?? "EMAIL";

  return (
    <Tabs defaultValue={initial} className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-3">
        <TabsList className="border-b-0">
          {channels.includes("EMAIL") && <TabsTrigger value="EMAIL">E-mail</TabsTrigger>}
          {channels.includes("WHATSAPP") && <TabsTrigger value="WHATSAPP">WhatsApp</TabsTrigger>}
        </TabsList>
        {data && (
          <span className="text-fg-subtle flex min-w-0 items-center gap-1.5 text-xs">
            <UserRound className="size-3.5 shrink-0" />
            <span className="truncate">
              {data.sample.fictitious ? "Dados de exemplo" : `Com os dados de ${data.sample.name}`}
            </span>
          </span>
        )}
      </div>

      {channels.includes("EMAIL") && (
        <TabsContent value="EMAIL" className="mt-3 outline-none">
          <div className="border-border bg-surface overflow-hidden rounded-md border shadow-sm">
            <div className="border-border flex items-start gap-3 border-b px-4 py-3">
              <div className="min-w-0 flex-1">
                {loading && !data ? (
                  <Skeleton className="h-5 w-2/3" />
                ) : (
                  <p className="truncate text-base font-semibold">
                    {data?.subject || (
                      <span className="text-fg-faint font-normal">Sem assunto</span>
                    )}
                  </p>
                )}
                <p className="text-fg-subtle mt-1 truncate text-xs">
                  De {fromLabel} · para {data?.sample.name ?? "destinatário"}
                </p>
              </div>
              <div className="border-border flex shrink-0 rounded-sm border p-0.5">
                {(
                  [
                    ["desktop", Monitor, "Visualizar como computador"],
                    ["mobile", Smartphone, "Visualizar como celular"],
                  ] as const
                ).map(([d, Icon, label]) => (
                  <button
                    key={d}
                    type="button"
                    aria-label={label}
                    aria-pressed={device === d}
                    onClick={() => setDevice(d)}
                    className={cn(
                      "text-fg-subtle grid size-7 place-items-center rounded-xs transition-colors",
                      device === d ? "bg-surface-sunken text-fg" : "hover:text-fg",
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-surface-sunken flex justify-center p-3 sm:p-4">
              {data ? (
                <iframe
                  title="Pré-visualização do e-mail"
                  srcDoc={data.html}
                  sandbox=""
                  className={cn(
                    "h-[560px] rounded-sm bg-white shadow-sm transition-[width] duration-200 ease-out",
                    device === "mobile" ? "w-[375px] max-w-full" : "w-full",
                    loading && "opacity-60",
                  )}
                />
              ) : (
                <Skeleton className="h-[560px] w-full" />
              )}
            </div>
          </div>
        </TabsContent>
      )}

      {channels.includes("WHATSAPP") && (
        <TabsContent value="WHATSAPP" className="mt-3 outline-none">
          <div className="border-border overflow-hidden rounded-md border shadow-sm">
            <div className="flex items-center gap-3 bg-[#075e54] px-4 py-2.5 text-white">
              <span className="grid size-8 place-items-center rounded-full bg-white/20 text-xs font-semibold">
                {fromLabel.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{fromLabel}</p>
                <p className="text-2xs text-white/70">online</p>
              </div>
            </div>
            <div className="min-h-[420px] bg-[#efeae2] px-3 py-5 sm:px-6 dark:bg-[#0b141a]">
              {data?.whatsapp ? (
                <div
                  className={cn(
                    "relative ml-auto max-w-[88%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 pt-2 pb-5 text-[14.2px] leading-[1.45] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] sm:max-w-[78%] dark:bg-[#005c4b] dark:text-[#e9edef]",
                    loading && "opacity-60",
                  )}
                >
                  <div
                    className="break-words whitespace-pre-wrap"
                    // Texto escapado em whatsappHtml antes de aplicar a formatação
                    dangerouslySetInnerHTML={{ __html: whatsappHtml(data.whatsapp) }}
                  />
                  <span className="absolute right-2 bottom-1 flex items-center gap-1 text-[11px] text-[#667781] dark:text-[#8696a0]">
                    {now()}
                    <CheckCheck className="size-3.5 text-[#53bdeb]" />
                  </span>
                </div>
              ) : loading ? (
                <Skeleton className="ml-auto h-40 w-3/4 rounded-lg" />
              ) : (
                <p className="text-center text-sm text-[#667781]">
                  Escreva a versão de WhatsApp para ver como ela chega.
                </p>
              )}
            </div>
          </div>
        </TabsContent>
      )}
    </Tabs>
  );
}
