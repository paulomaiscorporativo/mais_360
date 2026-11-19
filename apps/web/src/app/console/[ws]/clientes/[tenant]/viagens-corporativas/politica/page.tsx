import type { Metadata } from "next";
import {
  approvalModeOf,
  centsToInput,
  describeRule,
  policyAppliesToSchema,
} from "@mais/core/corporate-travel";
import { guard } from "@/server/auth";
import { loadApprovalFlows, loadPolicies, requireCorporateTravel } from "@/server/corporate-travel";
import { PolicyBoard, type PolicyRow } from "./policy-editor";

export const metadata: Metadata = { title: "Política de viagem" };

/** Política do cliente (regras como dado) e modo de aprovação. */
export default async function PolicyPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { tenant } = await params;
  const c = await guard(requireCorporateTravel(tenant));
  const [policies, flows, memberTypes] = await Promise.all([
    loadPolicies(c.db),
    loadApprovalFlows(c.db),
    c.db.person.findMany({
      where: { memberType: { not: "" }, archivedAt: null },
      distinct: ["memberType"],
      select: { memberType: true },
      take: 50,
    }),
  ]);
  const rows: PolicyRow[] = policies.map((p) => {
    const a = policyAppliesToSchema.parse(p.appliesTo ?? {});
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      active: p.active,
      priority: p.priority,
      memberTypes: a.memberTypes,
      jobTitles: a.jobTitles,
      minAdvanceDays: p.minAdvanceDays === null ? "" : String(p.minAdvanceDays),
      requireInsuranceInternational: p.requireInsuranceInternational,
      requireJustification: p.requireJustification,
      summary: p.rules.map(describeRule),
      rules: p.rules.map((r) => ({
        serviceType: r.serviceType === "HOTEL" ? "HOTEL" : "AIR",
        unit: (["trecho", "viagem", "noite", "diaria", "pessoa"].includes(r.unit)
          ? r.unit
          : "viagem") as PolicyRow["rules"][number]["unit"],
        scope: r.scope,
        destination: r.destination,
        maxAmount: centsToInput(r.maxAmountCents),
        currency: (["BRL", "USD", "EUR"].includes(r.currency) ? r.currency : "BRL") as
          "BRL" | "USD" | "EUR",
        maxCabin: r.maxCabin ?? "",
        maxHotelStars: r.maxHotelStars ? (String(r.maxHotelStars) as "3" | "4" | "5") : "",
      })),
    };
  });
  return (
    <PolicyBoard
      tenant={tenant}
      canEdit={c.canConfigure}
      policies={rows}
      approvalMode={approvalModeOf(flows)}
      memberTypes={memberTypes.map((m) => m.memberType)}
    />
  );
}
