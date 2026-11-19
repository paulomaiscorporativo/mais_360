import {
  BadgeCheck,
  BedDouble,
  CalendarRange,
  ClipboardCheck,
  DoorOpen,
  FileText,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  MailOpen,
  Megaphone,
  Plane,
  ScanFace,
  Settings,
  Store,
  Ticket,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { ProjectFeature } from "@mais/core";

/**
 * REGISTRO da navegação do projeto (contrato da Onda 2).
 *
 * Cada módulo de projeto ACRESCENTA uma entrada aqui; o layout do projeto mostra
 * só as entradas cujo `feature` está ligado (ou `always`). `href` é relativo à
 * base do projeto (/console/<ws>/clientes/<tenant>/projetos/<project>).
 * A ordem do array é a ordem do menu.
 *
 * `ready: false` mantém a entrada fora do menu até o módulo existir — assim o
 * menu nunca leva a uma página que ainda não foi construída.
 */
export type ProjectNavEntry = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  feature?: ProjectFeature;
  always?: boolean;
  ready: boolean;
};

export const PROJECT_NAV: ProjectNavEntry[] = [
  { key: "overview", label: "Visão geral", href: "", icon: LayoutDashboard, always: true, ready: true },
  { key: "registrations", label: "Inscrições", href: "/inscricoes", icon: Users, always: true, ready: true },
  // ── Onda 2: viagens de grupo ──
  { key: "flights", label: "Voos", href: "/voos", icon: Plane, feature: "FLIGHTS", ready: false },
  { key: "accommodation", label: "Hospedagem", href: "/hospedagem", icon: BedDouble, feature: "ACCOMMODATION", ready: false },
  { key: "itinerary", label: "Roteiro", href: "/roteiro", icon: CalendarRange, feature: "ITINERARY", ready: false },
  { key: "checklist", label: "Checklist", href: "/checklist", icon: ListChecks, feature: "CHECKLIST", ready: false },
  { key: "mural", label: "Mural", href: "/mural", icon: Megaphone, feature: "MURAL", ready: false },
  { key: "support", label: "Suporte", href: "/suporte", icon: LifeBuoy, feature: "SUPPORT", ready: false },
  { key: "documents", label: "Documentos", href: "/documentos", icon: FileText, feature: "DOCUMENTS", ready: false },
  { key: "vouchers", label: "Vouchers", href: "/vouchers", icon: Ticket, feature: "VOUCHERS", ready: false },
  // ── Onda 2: eventos e convites ──
  { key: "invites", label: "Convites", href: "/convites", icon: MailOpen, feature: "INVITES", ready: false },
  { key: "tables", label: "Mesas", href: "/mesas", icon: UtensilsCrossed, feature: "TABLES", ready: false },
  // ── Credenciamento e feiras ──
  { key: "accreditation", label: "Credenciamento", href: "/credenciamento", icon: BadgeCheck, feature: "ACCREDITATION", ready: false },
  { key: "kiosk", label: "Totens", href: "/totens", icon: ScanFace, feature: "SELF_SERVICE", ready: false },
  { key: "access", label: "Acesso", href: "/acesso", icon: DoorOpen, feature: "ACCESS_CONTROL", ready: false },
  { key: "networking", label: "Networking", href: "/networking", icon: Handshake, feature: "NETWORKING", ready: false },
  { key: "stands", label: "Stands", href: "/stands", icon: Store, feature: "STANDS", ready: false },
  { key: "form", label: "Formulário", href: "/formulario", icon: ClipboardCheck, feature: "REGISTRATION_FORM", ready: true },
  { key: "settings", label: "Configurações", href: "/configuracoes", icon: Settings, always: true, ready: true },
];

export function projectNavFor(features: ReadonlySet<ProjectFeature>): ProjectNavEntry[] {
  return PROJECT_NAV.filter(
    (e) => e.ready && (e.always || (e.feature !== undefined && features.has(e.feature))),
  );
}
