"use server";

import { after } from "next/server";
import { z } from "zod";
import { VOUCHER_INLINE_LIMIT, voucherJobKey } from "@mais/core";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { sortBy } from "@mais/core/sorting";
import { invalidFields, notFound } from "@/server/errors";
import { projectSorting, sortRowsOf } from "@/server/sorting";
import { assertRegistrations, requireTravelWriter } from "@/server/travel";
import { enqueueVoucherJob, issueVoucher, processVoucherJobs } from "@/server/vouchers";

async function voucherTemplate(
  p: Awaited<ReturnType<typeof requireTravelWriter>>,
  templateId: string,
) {
  const t = await p.db.documentTemplate.findFirst({
    where: {
      id: templateId,
      kind: "VOUCHER",
      archivedAt: null,
      OR: [{ projectId: p.projectId }, { projectId: null }],
    },
    select: { id: true, name: true },
  });
  if (!t) throw notFound("Modelo de voucher não encontrado.");
  return t;
}

/**
 * Emite os vouchers e publica no portal. Até VOUCHER_INLINE_LIMIT pessoas
 * sai na hora; acima disso vira job (a tela acompanha o progresso).
 */
export const issueVouchers = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    templateId: z.string(),
    registrationIds: z.array(z.string()).max(1000, "Emita no máximo 1.000 vouchers por vez."),
    notify: z.boolean().default(false),
    /** Ordenação escolhida na hora (SortSpec em JSON); sem ela, o padrão do projeto. */
    sort: z.string().max(2000).optional(),
  }),
  async ({ tenant, projectId, templateId, registrationIds, notify, sort }) => {
    const p = await requireTravelWriter(tenant, projectId, "VOUCHERS");
    const unique = [...new Set(registrationIds)];
    if (!unique.length) throw invalidFields({ registrationIds: "Escolha ao menos um viajante." });
    await assertRegistrations(p.db, projectId, unique);
    // O lote é emitido na ordem configurada (e a fila segue essa ordem)
    const [sorting, rows] = await Promise.all([
      projectSorting(p, sort),
      sortRowsOf(p.db, projectId, unique),
    ]);
    const ids = sortBy(unique, (id) => rows.get(id) ?? { id, fullName: "" }, sorting.spec);
    const template = await voucherTemplate(p, templateId);
    const actor = { label: p.actor, userId: p.viewer.user.id };

    await audit({
      action: "vouchers.issue",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "DocumentTemplate",
      entityId: template.id,
      data: { count: ids.length, notify },
    });

    if (ids.length <= VOUCHER_INLINE_LIMIT) {
      let issued = 0;
      for (const registrationId of ids)
        if (
          await issueVoucher({
            tenantId: p.tenantId,
            projectId,
            template,
            registrationId,
            notify,
            actor,
          })
        )
          issued++;
      return { mode: "inline" as const, issued, total: ids.length };
    }

    await enqueueVoucherJob(
      {
        tenantId: p.tenantId,
        projectId,
        templateId: template.id,
        registrationIds: ids,
        notify,
        actor,
      },
      voucherJobKey(projectId, template.id, ids),
    );
    after(() => processVoucherJobs().catch((e) => console.error("[vouchers] fila", e)));
    return { mode: "queued" as const, issued: 0, total: ids.length };
  },
);

/** Liga/desliga a geração do voucher sob demanda no portal do viajante. */
export const setVoucherInPortal = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    templateId: z.string(),
    visible: z.boolean(),
  }),
  async ({ tenant, projectId, templateId, visible }) => {
    const p = await requireTravelWriter(tenant, projectId, "VOUCHERS");
    const template = await voucherTemplate(p, templateId);
    await p.db.documentTemplate.updateMany({
      where: { id: template.id },
      data: { visibleToPerson: visible },
    });
    await audit({
      action: "vouchers.portal",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "DocumentTemplate",
      entityId: template.id,
      data: { visible },
    });
    return null;
  },
);
