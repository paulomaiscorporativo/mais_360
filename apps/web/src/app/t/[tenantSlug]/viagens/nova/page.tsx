import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui";
import { personName } from "@/server/corporate-travel";
import { currentMember } from "@/server/member-portal";
import { loadMemberArea, MemberShell } from "../shell";
import { MemberMenu } from "../member-client";
import { NewMemberRequest } from "./new-request";

export const metadata: Metadata = {
  title: { absolute: "Nova solicitação de viagem" },
  robots: { index: false, follow: false },
};

export default async function NewMemberRequestPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const area = await loadMemberArea(tenantSlug);
  if (!area) notFound();
  const m = await currentMember(tenantSlug);
  if (!m || m.person.mustChangePassword) redirect(area.base);

  return (
    <MemberShell
      tenant={area.tenant}
      showProduct={!!area.brand.productName}
      title="Nova solicitação"
      subtitle="A equipe cota e você compara as opções aqui mesmo."
      aside={<MemberMenu tenantSlug={tenantSlug} />}
    >
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href={area.base}>
          <ArrowLeft /> Minhas solicitações
        </Link>
      </Button>
      <NewMemberRequest
        tenantSlug={tenantSlug}
        base={area.base}
        holder={{ name: personName(m.person), email: m.person.email, phone: m.person.phone }}
      />
    </MemberShell>
  );
}
