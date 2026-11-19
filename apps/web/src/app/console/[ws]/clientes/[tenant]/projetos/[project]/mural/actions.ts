"use server";

import { after } from "next/server";
import { z } from "zod";
import { isVisibleTo, parseLocalDateTime } from "@mais/core";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { invalidFields, notFound } from "@/server/errors";
import {
  audienceViewerOf,
  checkAudience,
  notifyTravelers,
  requireTravelWriter,
  travelerPortalUrl,
} from "@/server/travel";

const AUDIENCES = ["ALL", "STAFF", "GROUP", "CATEGORY", "INDIVIDUAL"] as const;
const local = z.string().trim().default("");

export const saveMuralPost = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    id: z.string().nullable(),
    title: z.string().trim().min(2, "Dê um título ao aviso.").max(140),
    message: z.string().trim().min(2, "Escreva o aviso.").max(4000),
    audience: z.enum(AUDIENCES),
    audienceId: z.string().nullable(),
    urgent: z.boolean(),
    pinned: z.boolean(),
    active: z.boolean(),
    publishAt: local,
    expiresAt: local,
    notify: z.boolean().default(false),
  }),
  async ({
    tenant,
    projectId,
    id,
    publishAt,
    expiresAt,
    notify,
    audience,
    audienceId,
    ...rest
  }) => {
    const p = await requireTravelWriter(tenant, projectId, "MURAL");
    const pub = publishAt ? parseLocalDateTime(publishAt, p.tz) : new Date();
    const exp = expiresAt ? parseLocalDateTime(expiresAt, p.tz) : null;
    if (!pub) throw invalidFields({ publishAt: "Data e hora inválidas." });
    if (expiresAt && !exp) throw invalidFields({ expiresAt: "Data e hora inválidas." });
    if (exp && exp <= pub)
      throw invalidFields({ expiresAt: "A expiração precisa ser depois da publicação." });

    const data = {
      ...rest,
      audience,
      audienceId: await checkAudience(p.db, projectId, audience, audienceId),
      publishAt: pub,
      expiresAt: exp,
    };
    let postId = id;
    if (id) {
      const found = await p.db.muralPost.findFirst({ where: { id, projectId } });
      if (!found) throw notFound("Aviso não encontrado.");
      await p.db.muralPost.update({ where: { id }, data });
    } else {
      const created = await p.db.muralPost.create({
        data: { ...data, author: p.actor, projectId, tenantId: p.tenantId },
      });
      postId = created.id;
    }
    if (!postId) throw notFound("Aviso não encontrado.");

    await audit({
      action: id ? "mural.update" : "mural.create",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "MuralPost",
      entityId: postId,
      data: { title: data.title, audience, notify },
    });

    // Aviso imediato por e-mail e WhatsApp para quem vê o post (uma vez por aviso e pessoa)
    let recipients = 0;
    if (notify && data.active && audience !== "STAFF") {
      const regs = await p.db.registration.findMany({
        where: { projectId, status: { notIn: ["CANCELED", "DECLINED"] } },
        select: { id: true, groupId: true, categoryId: true, role: true, token: true },
      });
      const targets = regs.filter((r) =>
        isVisibleTo({ audience, audienceId: data.audienceId }, audienceViewerOf(r)),
      );
      recipients = targets.length;
      const tenantRef = { id: p.tenant.id, slug: p.tenant.slug };
      const projectName = p.project.name;
      const tenantId = p.tenantId;
      const reason = `mural.${postId}`;
      after(async () => {
        try {
          for (const r of targets) {
            const link = await travelerPortalUrl(tenantRef, r.token);
            await notifyTravelers({
              tenantId,
              projectId,
              registrationIds: [r.id],
              reason,
              template: {
                name: `Mural: ${data.title}`.slice(0, 120),
                emailSubject:
                  `${data.urgent ? "Urgente: " : ""}${data.title} · ${projectName}`.slice(0, 200),
                emailBody: [
                  "Olá, {{primeiro_nome}}!",
                  "",
                  `**${data.title}**`,
                  "",
                  data.message,
                  "",
                  `Veja todos os avisos da viagem no seu portal: ${link}`,
                ].join("\n"),
                whatsappBody: [
                  `*${data.title}*`,
                  "",
                  data.message,
                  "",
                  `Portal da viagem: ${link}`,
                ].join("\n"),
                includeActions: false,
              },
            });
          }
        } catch (err) {
          console.error("[mural] envio do aviso", err);
        }
      });
    }
    return { id: postId, recipients };
  },
);

export const toggleMuralPost = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    id: z.string(),
    field: z.enum(["pinned", "active"]),
    value: z.boolean(),
  }),
  async ({ tenant, projectId, id, field, value }) => {
    const p = await requireTravelWriter(tenant, projectId, "MURAL");
    const r = await p.db.muralPost.updateMany({
      where: { id, projectId },
      data: { [field]: value },
    });
    if (!r.count) throw notFound("Aviso não encontrado.");
    return null;
  },
);

export const deleteMuralPost = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), id: z.string() }),
  async ({ tenant, projectId, id }) => {
    const p = await requireTravelWriter(tenant, projectId, "MURAL");
    const post = await p.db.muralPost.findFirst({ where: { id, projectId } });
    if (!post) throw notFound("Aviso não encontrado.");
    await p.db.muralPost.deleteMany({ where: { id, projectId } });
    await audit({
      action: "mural.delete",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "MuralPost",
      entityId: id,
      data: { title: post.title },
    });
    return null;
  },
);
