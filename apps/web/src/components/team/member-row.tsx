import { USER_ACCESS_STATUS_LABELS, type UserAccessStatus } from "@mais/core";
import { Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Dados comuns de um membro nas três telas de equipe (cliente, assinante, plataforma). */
export type TeamMemberView = {
  userId: string;
  name: string;
  email: string;
  status: UserAccessStatus;
  inviteExpiresAt: string | null;
  lastLoginAt: string | null;
};

const since = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

export function lastSeen(iso: string | null) {
  if (!iso) return "Nunca acessou";
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return days === 0 ? "Acessou hoje" : `Acessou ${since.format(days, "day")}`;
}

/** Texto curto da situação: "Ativo · acessou ontem", "Convite expira em 3 de dez.". */
function statusDetail(m: TeamMemberView) {
  if (m.status === "INVITED") {
    if (!m.inviteExpiresAt) return "Sem convite válido";
    const expires = new Date(m.inviteExpiresAt);
    return expires.getTime() <= Date.now()
      ? "Convite expirado"
      : `Convite vale até ${dayFmt.format(expires)}`;
  }
  return lastSeen(m.lastLoginAt);
}

const TONE: Record<UserAccessStatus, "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  INVITED: "warning",
  DISABLED: "neutral",
};

export function AccessStatusBadge({ status }: { status: UserAccessStatus }) {
  return (
    <Badge size="sm" tone={TONE[status]} dot>
      {USER_ACCESS_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * Linha de membro: identidade à esquerda, papel e ações à direita. No mobile
 * o papel desce para a linha de detalhes e as ações ficam no menu.
 */
export function TeamMemberRow({
  member,
  isSelf,
  roleLabel,
  extra,
  actions,
}: {
  member: TeamMemberView;
  isSelf: boolean;
  roleLabel: string;
  /** Informação secundária (ex.: "3 projetos"). */
  extra?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const disabled = member.status === "DISABLED";
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <Avatar name={member.name} size="md" className={cn(disabled && "opacity-50")} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("truncate font-medium", disabled && "text-fg-muted")}>
            {member.name}
          </span>
          {isSelf && <Badge size="sm">Você</Badge>}
          {member.status !== "ACTIVE" && <AccessStatusBadge status={member.status} />}
        </div>
        <div className="text-fg-subtle mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
          <span className="truncate">{member.email}</span>
          <span className="sm:hidden">{roleLabel}</span>
          <span className="hidden sm:inline">{statusDetail(member)}</span>
          {extra && <span className="hidden sm:inline">{extra}</span>}
        </div>
      </div>
      <Badge tone={disabled ? "neutral" : "brand"} className="hidden sm:inline-flex">
        {roleLabel}
      </Badge>
      {actions}
    </li>
  );
}

export function TeamList({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <ul
      aria-label={label}
      className="divide-border border-border bg-surface divide-y overflow-hidden rounded-md border shadow-sm"
    >
      {children}
    </ul>
  );
}
