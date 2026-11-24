/** Rótulos e tons de status da comunicação (texto + cor — nunca só cor). */

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  SCHEDULED: { label: "Agendado", tone: "info" },
  RUNNING: { label: "Enviando", tone: "brand" },
  PAUSED: { label: "Pausado", tone: "warning" },
  WAITING_WINDOW: { label: "Aguardando horário", tone: "info" },
  COMPLETED: { label: "Concluído", tone: "success" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
  FAILED: { label: "Interrompido", tone: "danger" },
};

export const ACTIVE_CAMPAIGN = new Set(["SCHEDULED", "RUNNING", "PAUSED", "WAITING_WINDOW"]);

export const DELIVERY_STATUS: Record<string, { label: string; tone: Tone }> = {
  QUEUED: { label: "Na fila", tone: "neutral" },
  SENDING: { label: "Enviando", tone: "brand" },
  SENT: { label: "Enviado", tone: "info" },
  DELIVERED: { label: "Entregue", tone: "success" },
  READ: { label: "Lido", tone: "success" },
  FAILED: { label: "Falhou", tone: "danger" },
  SKIPPED: { label: "Pulado", tone: "warning" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
};

export const CHANNEL_LABEL = { EMAIL: "E-mail", WHATSAPP: "WhatsApp" } as const;

export const PURPOSE_LABEL: Record<string, string> = {
  CUSTOM: "Mensagem livre",
  INVITE: "Convite",
  INVITE_CANCEL: "Cancelamento de convite",
  REGISTRATION_CONFIRMED: "Inscrição confirmada",
  REMINDER: "Lembrete",
  CHECKIN_WELCOME: "Boas-vindas no check-in",
  VOUCHER: "Envio de voucher",
  TRAVEL_REQUEST_RECEIPT: "Recebimento de solicitação",
  TRAVEL_QUOTE_READY: "Cotação pronta",
  APPROVAL_REQUEST: "Pedido de aprovação",
  PASSWORD_ACCESS: "Acesso e senha",
  SURVEY: "Pesquisa pós-evento",
  FLIGHT_REMINDER: "Lembrete de voo",
  TRAVEL_DOCUMENTS: "Documentos de viagem",
};

export type TriggerInfo = {
  label: string;
  hint: string;
  /** Explicação para o operador, em linguagem simples */
  explain: string;
  usesDays: boolean;
  usesHours?: boolean;
  repeats?: boolean;
  /** Recurso do projeto sem o qual o gatilho não faz sentido */
  feature?: "FLIGHTS" | "DOCUMENTS" | "INVITES";
  /** Finalidade de modelo sugerida (oferece modelo inicial se faltar) */
  purpose?: string;
  group: "event" | "date" | "travel";
};

export const TRIGGER_LABEL: Record<string, TriggerInfo> = {
  REGISTRATION_CREATED: {
    label: "Quando a inscrição é criada",
    hint: "Sai alguns segundos depois do cadastro.",
    explain:
      "Vale para formulário, inclusão manual, importação de planilha e convites emitidos. A migração do sistema antigo não dispara.",
    usesDays: false,
    group: "event",
  },
  REGISTRATION_CONFIRMED: {
    label: "Quando a presença é confirmada",
    hint: "Ideal para o crachá digital e as instruções de acesso.",
    explain:
      "Sai quando a pessoa confirma pelo convite, se inscreve pelo formulário ou a equipe marca como confirmada. O formulário público já manda a credencial: evite repetir o mesmo conteúdo.",
    usesDays: false,
    purpose: "REGISTRATION_CONFIRMED",
    group: "event",
  },
  CHECKED_IN: {
    label: "No check-in",
    hint: "Boas-vindas e agenda assim que a pessoa é credenciada.",
    explain:
      "Sai logo depois do credenciamento no balcão, leitor ou totem. Se a fila atrasar mais de 6 horas, a mensagem não sai mais.",
    usesDays: false,
    purpose: "CHECKIN_WELCOME",
    group: "event",
  },
  DAYS_BEFORE_START: {
    label: "Dias antes do início",
    hint: "Lembretes de véspera e de uma semana antes.",
    explain:
      "Sai no dia e horário escolhidos, no fuso do projeto, para quem estiver inscrito naquele momento.",
    usesDays: true,
    purpose: "REMINDER",
    group: "date",
  },
  DAYS_AFTER_END: {
    label: "Dias depois do término",
    hint: "Agradecimento e pesquisa de satisfação.",
    explain: "Conta a partir do último dia do projeto (ou do início, se não houver término).",
    usesDays: true,
    purpose: "SURVEY",
    group: "date",
  },
  INVITE_DEADLINE_BEFORE: {
    label: "Dias antes da data-limite das cotas",
    hint: "Avisa as empresas que ainda não usaram os convites.",
    explain:
      "Vai só para o responsável de cada empresa que ainda tem convites sobrando e não foi travada.",
    usesDays: true,
    feature: "INVITES",
    group: "date",
  },
  FLIGHT_DEPARTURE_BEFORE: {
    label: "Horas antes de cada voo",
    hint: "Lembrete de embarque com número, horário e localizador.",
    explain:
      "Cada viajante recebe uma vez por voo em que está, na antecedência escolhida. Se o voo for remarcado, o lembrete acompanha o novo horário.",
    usesDays: false,
    usesHours: true,
    feature: "FLIGHTS",
    purpose: "FLIGHT_REMINDER",
    group: "travel",
  },
  PASSPORT_EXPIRING: {
    label: "Passaporte ausente ou vencendo",
    hint: "Cobra quem não enviou ou vence antes de 6 meses da volta.",
    explain:
      "Começa na antecedência escolhida antes do embarque e repete no intervalo definido, só para quem continua pendente, até o teto de envios ou o embarque.",
    usesDays: true,
    repeats: true,
    feature: "DOCUMENTS",
    purpose: "TRAVEL_DOCUMENTS",
    group: "travel",
  },
  DOCUMENTS_PENDING: {
    label: "Documentos pendentes",
    hint: "Lembra os documentos exigidos que faltam ou venceram.",
    explain:
      "Usa os documentos exigidos do projeto. Repete só para quem continua pendente, até o teto de envios ou o embarque. Use {{pendencias}} na mensagem.",
    usesDays: true,
    repeats: true,
    feature: "DOCUMENTS",
    purpose: "TRAVEL_DOCUMENTS",
    group: "travel",
  },
};

export const ROLE_LABEL: Record<string, string> = {
  TRAVELER: "Viajantes",
  COMPANION: "Acompanhantes",
  GUEST: "Convidados",
  ATTENDEE: "Participantes",
  EXHIBITOR: "Expositores",
  SPEAKER: "Palestrantes",
  STAFF: "Equipe",
  PRESS: "Imprensa",
};

export const REG_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendentes",
  INVITED: "Convidados",
  CONFIRMED: "Confirmados",
  DECLINED: "Recusaram",
  WAITLIST: "Lista de espera",
  CANCELED: "Cancelados",
};

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
export const fmtDateTime = (iso: string | Date | null | undefined) =>
  iso ? dateTime.format(new Date(iso)).replace(".", "") : "—";

const rel = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
/** "em 3 min", "há 2 h" */
export function fmtRelative(iso: string | Date | null | undefined, now = Date.now()) {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 45_000) return diff >= 0 ? "agora" : "agora há pouco";
  if (abs < 3_600_000) return rel.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rel.format(Math.round(diff / 3_600_000), "hour");
  return rel.format(Math.round(diff / 86_400_000), "day");
}

export function fmtDuration(minutes: number) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Destino mascarado para listas (privacidade na tela compartilhada). */
export function maskTarget(target: string) {
  if (target.includes("@")) {
    const [user = "", domain = ""] = target.split("@");
    return `${user.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`;
  }
  return target.length > 6 ? `+${target.slice(0, 4)} ••••-${target.slice(-4)}` : target;
}
