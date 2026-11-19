import "server-only";
import {
  buildInviteReport,
  inviteStatus,
  INVITE_STATUS_LABELS,
  type InviteStatus,
} from "@mais/core";
import { toCsv, type CsvCell } from "@mais/core/csv";
import { PLATFORM_DEFAULT_SORT, sortBy, type SortSpec } from "@mais/core/sorting";
import { SORT_ROW_INCLUDE, toSortRow } from "./sorting";
import type { TenantDb } from "./tenant-db";

/**
 * RELATÓRIOS DE CONVITES — confirmações, presença e cotas por empresa.
 * A consolidação é pura (`buildInviteReport` em @mais/core/events); aqui só
 * se lê o banco com escopo do cliente e se monta o CSV. A ordem dos convidados
 * vem do spec de ordenação do projeto (`@mais/core/sorting`).
 */

export type ReportGuestRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  company: string;
  companyQuotaId: string | null;
  kind: "RESPONSIBLE" | "COMPANY_GUEST" | "INDIVIDUAL";
  category: string;
  status: InviteStatus;
  shortCode: string;
  table: string;
  sentAt: Date | null;
  confirmedAt: Date | null;
  checkedInAt: Date | null;
};

export async function loadInviteReport(
  db: TenantDb,
  projectId: string,
  spec: SortSpec = PLATFORM_DEFAULT_SORT,
) {
  const [invites, companies] = await Promise.all([
    db.eventInvite.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: {
        companyQuota: { select: { companyName: true } },
        registration: {
          include: {
            ...SORT_ROW_INCLUDE,
            person: { include: { organizations: SORT_ROW_INCLUDE.person.select.organizations } },
          },
        },
      },
    }),
    db.companyQuota.findMany({
      where: { projectId },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true, quota: true, returnedToPool: true },
    }),
  ]);

  const sortRows = new Map(invites.map((i) => [i.registrationId, toSortRow(i.registration)]));
  const unsorted: ReportGuestRow[] = invites.map((i) => {
    const r = i.registration;
    return {
      id: r.id,
      name: `${r.person.firstName} ${r.person.lastName}`.trim(),
      email: r.person.email,
      phone: r.person.phone,
      jobTitle: r.displayJobTitle || r.person.jobTitle,
      company: i.companyQuota?.companyName ?? r.displayCompany,
      companyQuotaId: i.companyQuotaId,
      kind: i.kind,
      category: r.category?.name ?? "",
      status: inviteStatus({ ...r, sentAt: i.sentAt }),
      shortCode: r.shortCode,
      table: r.seat ? `${r.seat.table.number}${r.seat.seat ? `/${r.seat.seat}` : ""}` : "",
      sentAt: i.sentAt,
      confirmedAt: r.confirmedAt,
      checkedInAt: r.checkedInAt,
    };
  });
  const guests = sortBy(
    unsorted,
    (g) => sortRows.get(g.id) ?? { id: g.id, fullName: g.name },
    spec,
  );

  const report = buildInviteReport(
    guests,
    companies.map((c) => ({
      id: c.id,
      name: c.companyName,
      quota: c.quota,
      returnedToPool: c.returnedToPool,
    })),
  );
  return { guests, ...report };
}

const KIND_LABEL = {
  RESPONSIBLE: "Responsável",
  COMPANY_GUEST: "Convidado da empresa",
  INDIVIDUAL: "Individual",
} as const;

/** Data e hora no fuso do projeto, no formato que o Excel reconhece. */
function stamp(d: Date | null, timeZone: string): CsvCell {
  if (!d) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  })
    .format(d)
    .replace(",", "");
}

const pct = (v: number | null) => (v === null ? "" : `${Math.round(v * 100)}%`);

/** CSV dos convidados na ordem recebida. Sem mapa de mesas, a coluna de mesa some. */
export function guestsCsv(
  rows: readonly ReportGuestRow[],
  timeZone: string,
  opts: { tables: boolean } = { tables: true },
) {
  const header = [
    "Nome",
    "E-mail",
    "WhatsApp",
    "Cargo",
    "Empresa",
    "Tipo",
    "Categoria",
    "Status",
    "Código",
    "Mesa/cadeira",
    "Convite enviado em",
    "Confirmou em",
    "Credenciado em",
  ];
  const tableCol = header.indexOf("Mesa/cadeira");
  const drop = <T>(cells: T[]) => (opts.tables ? cells : cells.filter((_, i) => i !== tableCol));
  return toCsv(
    drop(header),
    rows.map((g) =>
      drop<CsvCell>([
        g.name,
        g.email,
        g.phone,
        g.jobTitle,
        g.company,
        KIND_LABEL[g.kind],
        g.category,
        INVITE_STATUS_LABELS[g.status],
        g.shortCode,
        g.table,
        stamp(g.sentAt, timeZone),
        stamp(g.confirmedAt, timeZone),
        stamp(g.checkedInAt, timeZone),
      ]),
    ),
  );
}

export function companiesCsv(rows: ReturnType<typeof buildInviteReport>["companies"]) {
  return toCsv(
    [
      "Empresa",
      "Cota",
      "Usados",
      "Uso da cota",
      "Devolvidos ao pool",
      "Não enviados",
      "Enviados sem resposta",
      "Confirmados",
      "Recusaram",
      "Credenciados",
      "Cancelados",
      "Presença",
    ],
    rows.map((c) => [
      c.name,
      c.quota ?? "",
      c.active,
      pct(c.usage),
      c.returnedToPool,
      c.PENDING,
      c.SENT,
      c.CONFIRMED,
      c.DECLINED,
      c.CHECKED_IN,
      c.CANCELED,
      pct(c.attendance),
    ]),
  );
}
