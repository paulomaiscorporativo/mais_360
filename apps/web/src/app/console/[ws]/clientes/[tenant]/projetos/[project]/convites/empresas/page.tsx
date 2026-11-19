import { guard } from "@/server/auth";
import { companiesWithUsage, eventSettings } from "@/server/events";
import { requireProjectFeature } from "@/server/projects";
import { tenantPublicBase } from "@/server/public-links";
import { CompaniesManager, type CompanyRow } from "./companies";

export default async function CompaniesPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, project, "INVITES"));
  const [companies, settings] = await Promise.all([
    companiesWithUsage(p.db, p.projectId),
    eventSettings(p.db, p.projectId),
  ]);
  const tz = p.project.timezone ?? p.tenant.timezone;

  const rows: CompanyRow[] = companies.map((c) => {
    const resp = c.invites[0]?.registration;
    return {
      id: c.id,
      name: c.companyName,
      contactName: c.contactName,
      contactRole: c.contactRole,
      email: c.email,
      phone: c.phone,
      quota: c.quota,
      used: c.used,
      login: c.login,
      passwordChanged: !!c.passwordChangedAt,
      lastLoginAt: c.lastLoginAt?.toISOString() ?? null,
      locked: !!c.lockedAt,
      returned: c.returnedToPool,
      responsibleId: resp?.id ?? null,
    };
  });

  return (
    <CompaniesManager
      tenant={tenant}
      projectId={p.projectId}
      canEdit={p.canEdit}
      rows={rows}
      defaultQuota={settings.defaultQuota}
      portalUrl={`${await tenantPublicBase(p.tenant)}/empresa`}
      deadline={
        settings.inviteDeadline
          ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: tz }).format(
              settings.inviteDeadline,
            )
          : null
      }
      deadlinePassed={!!settings.inviteDeadline && settings.inviteDeadline < new Date()}
      expiredAt={
        settings.quotasExpiredAt
          ? new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: tz,
            }).format(settings.quotasExpiredAt)
          : null
      }
      pool={settings.individualPool}
    />
  );
}
