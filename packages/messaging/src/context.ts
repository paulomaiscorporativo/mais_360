import { formatPendencies, travelerPendingDocuments } from "@mais/core/automations";
import type { EmailBranding, MessageContext } from "@mais/core/messaging";
import type { Prisma, PrismaClient } from "@mais/db";
import { appUrl, defaultTimeZone } from "./env";
import { projectRequiredDocuments, reminderFlight, travelerDocumentStates } from "./group-travel";

/**
 * Monta o contexto de renderização a partir do banco. É chamado NA HORA DO
 * ENVIO: um disparo que dura dias usa os dados atuais ("faltam N dias",
 * confirmação, categoria), não os do momento em que foi criado.
 */

const tenantInclude = {
  branding: true,
  domains: { where: { primary: true, status: "VERIFIED" }, take: 1 },
  workspace: { select: { whiteLabel: true } },
} satisfies Prisma.TenantInclude;

type TenantForContext = Prisma.TenantGetPayload<{ include: typeof tenantInclude }>;
type ProjectForContext = {
  name: string;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string | null;
  venueName: string;
  venueAddress: string;
  destination: string;
  bannerFileId: string | null;
  logoFileId: string | null;
  primaryColor: string | null;
};

export type LoadedContext = {
  ctx: MessageContext;
  branding: EmailBranding;
  tenantId: string;
  projectId: string | null;
};

/** URL pública do cliente: domínio principal cadastrado ou APP_URL. */
export function publicBaseUrl(tenant: Pick<TenantForContext, "domains">): string {
  const host = tenant.domains[0]?.hostname;
  return host ? `https://${host}` : appUrl();
}

/** Arquivo público (logo, banner) servido pela aplicação web. */
export const publicFileUrl = (fileId: string | null | undefined) =>
  fileId ? `${appUrl()}/api/files/${fileId}` : undefined;

export function brandingFor(
  tenant: TenantForContext,
  project?: ProjectForContext | null,
): EmailBranding {
  const b = tenant.branding;
  return {
    primaryColor: project?.primaryColor || b?.primaryColor || "#002042",
    accentColor: b?.accentColor,
    logoUrl: publicFileUrl(project?.logoFileId ?? b?.logoFileId),
    bannerUrl: publicFileUrl(project?.bannerFileId),
    footer: b?.emailFooter || undefined,
    showPlatformBrand: !tenant.workspace.whiteLabel && (b?.showMaisBrand ?? true),
  };
}

function projectContext(p: ProjectForContext): NonNullable<MessageContext["project"]> {
  return {
    name: p.name,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    venueName: p.venueName,
    venueAddress: p.venueAddress,
    destination: p.destination,
  };
}

const projectSelect = {
  name: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  venueName: true,
  venueAddress: true,
  destination: true,
  bannerFileId: true,
  logoFileId: true,
  primaryColor: true,
} satisfies Prisma.ProjectSelect;

const personInclude = {
  organizations: {
    where: { primary: true },
    include: { organization: { select: { name: true } } },
    take: 1,
  },
} satisfies Prisma.PersonInclude;

type PersonForContext = Prisma.PersonGetPayload<{ include: typeof personInclude }>;

function personContext(
  p: PersonForContext,
  overrides: { company?: string; jobTitle?: string } = {},
): MessageContext["person"] {
  const primary = p.organizations[0];
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    badgeName: p.badgeName,
    email: p.email,
    phone: p.phone,
    company: overrides.company || primary?.organization.name || "",
    jobTitle: overrides.jobTitle || primary?.role || p.jobTitle,
  };
}

/**
 * Dados de viagem em grupo só são lidos quando o modelo usa esses campos
 * (`group`), para não pesar nas campanhas comuns.
 */
export type RegistrationContextOptions = {
  group?: { flight?: boolean; documents?: boolean; flightId?: string };
  now?: Date;
};

export async function loadRegistrationContext(
  db: PrismaClient,
  registrationId: string,
  opts: RegistrationContextOptions = {},
): Promise<LoadedContext | null> {
  const r = await db.registration.findUnique({
    where: { id: registrationId },
    include: {
      person: { include: personInclude },
      category: { select: { name: true } },
      project: {
        select: {
          ...projectSelect,
          id: true,
          settings: true,
          tenant: { include: tenantInclude },
          inviteSettings: { select: { dressCode: true, inviteDeadline: true } },
        },
      },
      // Dados do convite (módulo Eventos e convites) — ausentes nos demais projetos
      invite: { include: { companyQuota: { select: { companyName: true, login: true } } } },
      seat: { include: { table: { select: { number: true } } } },
    },
  });
  if (!r) return null;
  const tenant = r.project.tenant;
  const base = publicBaseUrl(tenant);
  const badgeUrl = `${base}/c/${r.token}`;
  const timeZone = r.project.timezone || tenant.timezone || defaultTimeZone();
  const now = opts.now ?? new Date();
  let group: MessageContext["group"] = { portalUrl: `${base}/v/${r.token}` };
  if (opts.group?.flight || opts.group?.flightId)
    group.flight = await reminderFlight(db, r.id, timeZone, {
      flightId: opts.group.flightId,
      now,
    });
  if (opts.group?.documents) {
    const required = await projectRequiredDocuments(db, r.project);
    const state = (
      await travelerDocumentStates(db, r.tenantId, [r.personId], required, r.project.endsAt)
    ).get(r.personId);
    if (state) {
      group = {
        ...group,
        pendencies: formatPendencies(travelerPendingDocuments(state, now)),
        passportExpiry:
          state.uploaded
            .filter((d) => d.kind === "PASSPORT")
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.expiresAt ??
          state.passportExpiry ??
          null,
      };
    }
  }
  return {
    tenantId: r.tenantId,
    projectId: r.projectId,
    branding: brandingFor(tenant, r.project),
    ctx: {
      timeZone,
      tenant: { name: tenant.name },
      group,
      person: personContext(r.person, { company: r.displayCompany, jobTitle: r.displayJobTitle }),
      registration: {
        status: r.status,
        checkedIn: !!r.checkedInAt,
        category: r.category?.name,
        shortCode: r.shortCode,
        badgeUrl,
        confirmUrl: `${badgeUrl}?confirmar=1`,
      },
      project: projectContext(r.project),
      ...(r.invite || r.seat || r.project.inviteSettings
        ? {
            invite: {
              table: r.seat?.table.number ?? null,
              seat: r.seat?.seat ?? null,
              dressCode: r.project.inviteSettings?.dressCode ?? "",
              deadline: r.project.inviteSettings?.inviteDeadline ?? null,
              invitingCompany: r.invite?.companyQuota?.companyName ?? "",
              // Login só para o responsável da empresa (convite traz o acesso ao painel)
              login: r.invite?.kind === "RESPONSIBLE" ? (r.invite.companyQuota?.login ?? "") : "",
              platformUrl: r.invite?.kind === "RESPONSIBLE" ? `${base}/empresa` : "",
            },
          }
        : {}),
    },
  };
}

/** Membro do cliente sem projeto (comunicados para associados, colaboradores…). */
export async function loadPersonContext(
  db: PrismaClient,
  personId: string,
  projectId?: string | null,
): Promise<LoadedContext | null> {
  const p = await db.person.findUnique({
    where: { id: personId },
    include: { ...personInclude, tenant: { include: tenantInclude } },
  });
  if (!p) return null;
  const project = projectId
    ? await db.project.findFirst({
        where: { id: projectId, tenantId: p.tenantId },
        select: projectSelect,
      })
    : null;
  return {
    tenantId: p.tenantId,
    projectId: project ? (projectId ?? null) : null,
    branding: brandingFor(p.tenant, project),
    ctx: {
      timeZone: project?.timezone || p.tenant.timezone || defaultTimeZone(),
      tenant: { name: p.tenant.name },
      person: personContext(p),
      ...(project ? { project: projectContext(project) } : {}),
    },
  };
}

/** Marca e fuso do cliente/projeto sem pessoa (pré-visualização com dados fictícios). */
export async function loadScopeBranding(
  db: PrismaClient,
  tenantId: string,
  projectId?: string | null,
): Promise<{
  tenantName: string;
  timeZone: string;
  branding: EmailBranding;
  project: MessageContext["project"] | null;
} | null> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, include: tenantInclude });
  if (!tenant) return null;
  const project = projectId
    ? await db.project.findFirst({ where: { id: projectId, tenantId }, select: projectSelect })
    : null;
  return {
    tenantName: tenant.name,
    timeZone: project?.timezone || tenant.timezone || defaultTimeZone(),
    branding: brandingFor(tenant, project),
    project: project ? projectContext(project) : null,
  };
}
