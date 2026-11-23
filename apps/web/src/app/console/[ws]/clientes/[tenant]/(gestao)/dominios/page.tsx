import type { Metadata } from "next";
import {
  defaultSubdomain,
  expectedRecords,
  isApexDomain,
  isPlatformHost,
} from "@mais/core/domains";
import { guard, requireTenant } from "@/server/auth";
import { domainTarget, platformDomains, rootDomain } from "@/server/domains";
import { env } from "@/server/env";
import { tenantDb } from "@/server/tenant-db";
import { DomainsManager, type DomainView } from "./domains";

export const metadata: Metadata = { title: "Domínios" };

const fmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: env.DEFAULT_TIMEZONE,
});

export default async function DomainsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const ctx = await guard(requireTenant(slug));
  const target = domainTarget();
  const roots = platformDomains();
  const fallback = defaultSubdomain(ctx.tenant.slug, rootDomain());
  const tz = ctx.tenant.timezone || env.DEFAULT_TIMEZONE;
  const fmtTz =
    tz === env.DEFAULT_TIMEZONE
      ? fmt
      : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: tz });

  const rows = await tenantDb(ctx).tenantDomain.findMany({
    orderBy: [{ primary: "desc" }, { createdAt: "asc" }],
  });

  // Só dono/admin do assinante (ou a plataforma) altera domínios
  const wsRole = ctx.viewer.user.workspaces.find(
    (w) => w.workspaceId === ctx.tenant.workspaceId,
  )?.role;
  const canEdit = ctx.viewer.isPlatformStaff || wsRole === "OWNER" || wsRole === "ADMIN";

  const domains: DomainView[] = rows
    .filter((d) => d.hostname !== fallback)
    .map((d) => {
      const records = expectedRecords(d.hostname, d.verificationToken, target);
      return {
        id: d.id,
        hostname: d.hostname,
        status: d.status,
        primary: d.primary,
        managedByPlatform: isPlatformHost(d.hostname, roots),
        apex: isApexDomain(d.hostname),
        lastError: d.lastError,
        lastCheckedLabel: d.lastCheckedAt ? fmtTz.format(d.lastCheckedAt) : null,
        verifiedLabel: d.verifiedAt ? fmtTz.format(d.verifiedAt) : null,
        records: [records.cname, records.txt],
      };
    });

  const primaryVerified = domains.some((d) => d.primary && d.status === "VERIFIED");

  return (
    <DomainsManager
      tenant={slug}
      tenantName={ctx.tenant.name}
      canEdit={canEdit}
      defaultHost={fallback}
      defaultIsPrimary={!primaryVerified}
      target={target}
      domains={domains}
    />
  );
}
