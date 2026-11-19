import {
  BadgeCheck,
  Briefcase,
  FileText,
  MailOpen,
  MessagesSquare,
  Plane,
  ScanFace,
  Store,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ModuleKey } from "@mais/core";
import { PRODUCT } from "./product";

type Line = keyof typeof PRODUCT.lines;

/** Ícone, caminho de URL e linha de produto de cada módulo (textos vêm do catálogo em @mais/core). */
/**
 * `path`: rota própria do módulo dentro do cliente (ex.: "documentos"). Sem ela,
 * o módulo usa a página genérica /m/<slug> até ganhar telas próprias.
 */
export const MODULE_UI: Record<
  ModuleKey,
  { slug: string; icon: LucideIcon; line?: Line; path?: string }
> = {
  COMMUNICATION: {
    slug: "comunicacao",
    icon: MessagesSquare,
    line: "connect",
    path: "comunicacao",
  },
  CORPORATE_TRAVEL: { slug: "viagens-corporativas", icon: Briefcase, line: "travel" },
  GROUP_TRAVEL: { slug: "viagens-de-grupo", icon: Plane, line: "travel" },
  EVENTS_INVITES: { slug: "eventos", icon: MailOpen, line: "events" },
  ACCREDITATION: { slug: "credenciamento", icon: BadgeCheck, line: "pass" },
  SELF_SERVICE_KIOSK: { slug: "autoatendimento", icon: ScanFace, line: "pass" },
  DOCUMENTS: { slug: "documentos", icon: FileText, path: "documentos" },
  EXHIBITIONS: { slug: "feiras", icon: Store, line: "expo" },
  INCENTIVE_GAMIFICATION: { slug: "incentivo", icon: Trophy },
  FINANCE: { slug: "financeiro", icon: Wallet },
};

export function moduleBySlug(slug: string): ModuleKey | null {
  const hit = Object.entries(MODULE_UI).find(([, v]) => v.slug === slug);
  return (hit?.[0] as ModuleKey | undefined) ?? null;
}

export function moduleLine(key: ModuleKey): string | null {
  const line = MODULE_UI[key].line;
  return line ? PRODUCT.lines[line] : null;
}

/** Link do módulo dentro do cliente (`base` = /console/<ws>/clientes/<tenant>). */
export function moduleHref(base: string, key: ModuleKey): string {
  const ui = MODULE_UI[key];
  return ui.path ? `${base}/${ui.path}` : `${base}/m/${ui.slug}`;
}
