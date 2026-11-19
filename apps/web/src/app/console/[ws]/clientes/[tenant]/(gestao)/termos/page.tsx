import type { Metadata } from "next";
import { termsWithDefaults } from "@/config/terms";
import { guard, requireTenant } from "@/server/auth";
import { prisma } from "@/server/db";
import { TermsForm } from "./form";

export const metadata: Metadata = { title: "Nomenclatura" };

export default async function TermsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const ctx = await guard(requireTenant(slug));
  const rows = await prisma.tenantTerm.findMany({ where: { tenantId: ctx.tenantId } });
  return (
    <TermsForm tenant={slug} initial={termsWithDefaults(rows)} canEdit={ctx.role === "ADMIN"} />
  );
}
