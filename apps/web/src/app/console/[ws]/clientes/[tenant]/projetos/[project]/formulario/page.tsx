import QRCode from "qrcode";
import { readProjectSettings } from "@mais/core";
import { guard } from "@/server/auth";
import { requireProjectFeature } from "@/server/projects";
import { publicFormUrl } from "@/server/public-links";
import { FormSettings } from "./form-settings";

export default async function FormPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project: slug } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, slug, "REGISTRATION_FORM"));
  const url = await publicFormUrl(p.tenant, p.project.publicToken);
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  const categories = await p.db.registrationCategory.findMany({
    where: { projectId: p.projectId },
    orderBy: { sortOrder: "asc" },
  });
  return (
    <FormSettings
      tenant={tenant}
      projectId={p.projectId}
      canEdit={p.canEdit}
      url={url}
      qrSvg={qr}
      networking={p.features.has("NETWORKING")}
      initial={readProjectSettings(p.project.settings).form}
      categories={categories.map((c) => ({ value: c.id, label: c.name }))}
    />
  );
}
