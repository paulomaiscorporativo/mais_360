import {
  Award,
  BedDouble,
  FileSignature,
  FileText,
  IdCard,
  Tag,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import type { DocumentKind } from "@mais/core";

/** Apresentação de cada tipo de documento (rótulo, uso, ícone e modelo inicial). */
export const KIND_UI: Record<
  DocumentKind,
  { label: string; plural: string; hint: string; icon: LucideIcon; starter: string | null }
> = {
  BADGE: {
    label: "Crachá",
    plural: "Crachás",
    hint: "Credencial completa, impressa direto no cartão ou papel A6.",
    icon: IdCard,
    starter: "BADGE_A6",
  },
  LABEL: {
    label: "Etiqueta",
    plural: "Etiquetas",
    hint: "Impressora térmica: o participante cola no crachá.",
    icon: Tag,
    starter: "LABEL_80X40",
  },
  VOUCHER: {
    label: "Voucher",
    plural: "Vouchers",
    hint: "Voos, hospedagem e roteiro do viajante, com a sua arte.",
    icon: Ticket,
    starter: "VOUCHER_A4",
  },
  CERTIFICATE: {
    label: "Certificado",
    plural: "Certificados",
    hint: "Participação em evento, curso ou imersão.",
    icon: Award,
    starter: null,
  },
  CONTRACT: {
    label: "Contrato",
    plural: "Contratos",
    hint: "Propostas e contratos de patrocínio.",
    icon: FileSignature,
    starter: null,
  },
  ROOMING_LIST: {
    label: "Rooming list",
    plural: "Rooming lists",
    hint: "Distribuição de quartos para o hotel.",
    icon: BedDouble,
    starter: null,
  },
  OTHER: {
    label: "Outro",
    plural: "Outros",
    hint: "Qualquer documento com campos da inscrição.",
    icon: FileText,
    starter: null,
  },
};

export const KIND_ORDER: DocumentKind[] = [
  "BADGE",
  "LABEL",
  "VOUCHER",
  "CERTIFICATE",
  "CONTRACT",
  "ROOMING_LIST",
  "OTHER",
];

export function formatSize(w: number, h: number) {
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
  return `${f(w)} × ${f(h)} mm`;
}
