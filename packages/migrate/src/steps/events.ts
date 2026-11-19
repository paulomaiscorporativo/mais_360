import { cleanText, readAmenities, readHotels } from "@mais/core";
import { decryptSecret, encryptSecret } from "@mais/core/crypto";
import type { Prisma } from "@mais/db";
import { idOf, keyOf, on, type Ctx } from "../context";
import {
  DELIVERY_CHANNEL,
  DELIVERY_STATUS,
  INVITE_KIND,
  TABLE_SHAPE,
  calendarAt,
  convert,
  convertPlaceholders,
  instant,
  isBcryptHash,
  parseJsonText,
  toDate,
} from "../rules";
import type { Row } from "../source";
import { orgIdFor } from "./core";

/**
 * Convites: configurações do evento, empresas com cota, mesas, convites
 * (EventInvite), lugares, histórico de envios e modelos de mensagem.
 * O histórico entra como SENT/FAILED/SKIPPED — nada fica na fila, nada é reenviado.
 */

/** Data-limite: dia inteiro (meia-noite UTC no legado) vale até 23:59 do fuso. */
function deadline(raw: unknown, tz: string): Date | null {
  const d = toDate(raw);
  if (!d) return null;
  const midnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  return midnight ? calendarAt(raw, "23:59", tz) : d;
}

export async function migrateEvents(ctx: Ctx) {
  const { tx, src, report, tenant } = ctx;

  // Mapas usados por outras etapas (calculados mesmo sem gravar)
  for (const c of src.rows("EventCompany"))
    ctx.maps.quotas.set(c.str("id"), idOf(ctx, "EventCompany", c.str("id")));
  for (const t of src.rows("EventTable"))
    ctx.maps.tables.set(t.str("id"), idOf(ctx, "EventTable", t.str("id")));
  if (!on(ctx, "convites")) return;

  const companiesByTrip = new Set(src.rows("EventCompany").map((c) => c.str("tripId")));
  const invitesByTrip = new Set(src.rows("Invite").map((i) => i.str("tripId")));

  for (const t of src.rows("Trip")) {
    const tripId = t.str("id");
    const project = ctx.maps.projects.get(tripId);
    if (!project) continue;
    const enabled = t.bool("invitesEnabled");
    if (!enabled && !companiesByTrip.has(tripId) && !invitesByTrip.has(tripId)) continue;
    report.read("EventInviteSettings");

    const hotels = parseJsonText(t.str("hotels"), []);
    const facilities = parseJsonText(t.str("facilities"), []);
    if (!hotels.ok)
      report.warn("INVALID_DATA", "Trip", tripId, "Lista de hotéis próximos ilegível: descartada.");
    if (!facilities.ok)
      report.warn("INVALID_DATA", "Trip", tripId, "Lista de facilidades ilegível: descartada.");
    const data = {
      eventTime: /^\d{2}:\d{2}$/.test(t.str("eventTime").trim()) ? t.str("eventTime").trim() : "",
      dressCode: t.str("dressCode"),
      inviteDeadline: deadline(t.date("inviteDeadline"), project.tz),
      individualPool: Math.max(0, t.num("individualPool")),
      quotasExpiredAt: t.bool("invitesExpired")
        ? (instant(t.date("updatedAt")) ?? new Date())
        : null,
      nearbyHotels: readHotels(hotels.value) as Prisma.InputJsonValue,
      amenities: readAmenities(facilities.value) as Prisma.InputJsonValue,
      allowCompanion: t.bool("allowCompanion"),
    };
    if (t.str("eventTime").trim() && !data.eventTime)
      report.warn(
        "INVALID_DATA",
        "Trip",
        tripId,
        `Horário "${t.str("eventTime")}" fora do padrão HH:MM: descartado.`,
      );
    const before = await tx.eventInviteSettings.findUnique({ where: { projectId: project.id } });
    await tx.eventInviteSettings.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, tenantId: tenant.id, ...data },
      update: data,
    });
    report.saved("EventInviteSettings", !!before);

    await migrateTemplates(ctx, t, project.id);
  }

  // Empresas com cota
  const companyNames = new Map<string, string>();
  for (const c of src.rows("EventCompany")) {
    report.read("CompanyQuota");
    const project = ctx.maps.projects.get(c.str("tripId"));
    if (!project) {
      report.skipped("CompanyQuota");
      continue;
    }
    const id = ctx.maps.quotas.get(c.str("id"))!;
    companyNames.set(c.str("id"), c.str("companyName"));
    const before = await tx.companyQuota.findUnique({ where: { id } });

    let login = cleanText(c.str("login")).toLowerCase();
    const loginOwner = await tx.companyQuota.findUnique({ where: { login }, select: { id: true } });
    if (loginOwner && loginOwner.id !== id) {
      login = `${login}-${ctx.prefix}`;
      report.warn(
        "CONFLICT",
        "EventCompany",
        c.str("id"),
        `Login já usado na plataforma: gravado como "${login}".`,
      );
    }
    const hash = c.str("passwordHash");
    if (!isBcryptHash(hash))
      report.warn(
        "INVALID_DATA",
        "EventCompany",
        c.str("id"),
        "Senha em formato desconhecido: redefinir a senha da empresa.",
      );

    // Senha provisória (texto puro no legado) → cifrada; reexecução não troca se for a mesma
    const provisional = c.str("provisionalPassword");
    let provisionalPasswordEnc = "";
    if (provisional) {
      if (!ctx.encryptionKey) {
        report.warn(
          "NOT_MIGRATED",
          "EventCompany",
          c.str("id"),
          "ENCRYPTION_KEY ausente: senha provisória não migrada.",
        );
      } else {
        let same = false;
        try {
          same =
            !!before?.provisionalPasswordEnc &&
            decryptSecret(before.provisionalPasswordEnc, ctx.encryptionKey) === provisional;
        } catch {
          same = false;
        }
        provisionalPasswordEnc =
          same && before
            ? before.provisionalPasswordEnc
            : encryptSecret(provisional, ctx.encryptionKey);
      }
    }

    const associate = c.ref("associateId");
    const associatePerson = associate
      ? ctx.maps.people.get(keyOf(ctx, "Associate", associate))
      : undefined;
    const organizationId =
      (associatePerson && ctx.maps.personOrg.get(associatePerson)) ||
      orgIdFor(ctx, c.str("companyName"));
    const data = {
      organizationId: organizationId ?? null,
      companyName: cleanText(c.str("companyName")) || "Empresa",
      contactName: c.str("contactName"),
      contactRole: c.str("contactRole"),
      email: c.str("email").trim().toLowerCase(),
      phone: c.str("phone"),
      quota: Math.max(0, c.num("quota", 4)),
      login,
      passwordHash: isBcryptHash(hash) ? hash : "!migrado-sem-senha",
      provisionalPasswordEnc,
    };
    await tx.companyQuota.upsert({
      where: { id },
      create: {
        id,
        tenantId: tenant.id,
        projectId: project.id,
        createdAt: instant(c.date("createdAt")) ?? undefined,
        ...data,
      },
      update: data,
    });
    report.saved("CompanyQuota", !!before);
  }

  // Mesas
  const tableNumbers = new Map<string, string>();
  for (const t of src.rows("EventTable")) {
    report.read("EventTable");
    const project = ctx.maps.projects.get(t.str("tripId"));
    if (!project) {
      report.skipped("EventTable");
      continue;
    }
    const id = ctx.maps.tables.get(t.str("id"))!;
    const number = t.int("number") ?? 0;
    const clash = await tx.eventTable.findUnique({
      where: { projectId_number: { projectId: project.id, number } },
      select: { id: true },
    });
    if (clash && clash.id !== id) {
      ctx.maps.tables.set(t.str("id"), clash.id);
      report.skipped("EventTable");
      report.warn(
        "CONFLICT",
        "EventTable",
        t.str("id"),
        `Mesa ${number} já existe no evento: lugares apontados para ela.`,
      );
      continue;
    }
    tableNumbers.set(id, String(number));
    const shape = convert(TABLE_SHAPE, t.str("shape"), "ROUND");
    const data = {
      number,
      name: t.str("name"),
      capacity: Math.max(1, t.num("capacity", 8)),
      shape: shape.value,
      x: t.num("x", 100),
      y: t.num("y", 100),
    };
    const before = await tx.eventTable.findUnique({ where: { id }, select: { id: true } });
    await tx.eventTable.upsert({
      where: { id },
      create: { id, tenantId: tenant.id, projectId: project.id, ...data },
      update: data,
    });
    report.saved("EventTable", !!before);
  }

  // Envios: primeira entrega bem-sucedida = data do envio do convite
  const deliveries = src.rows("InviteDelivery");
  const firstSent = new Map<string, Date>();
  for (const d of deliveries) {
    if (d.str("status").toUpperCase() !== "ENVIADO") continue;
    const at = instant(d.date("createdAt"));
    const prev = firstSent.get(d.str("inviteId"));
    if (at && (!prev || at < prev)) firstSent.set(d.str("inviteId"), at);
  }

  // Convites (a inscrição já foi gravada na etapa "inscricoes") e lugares
  const projectIds = [...ctx.maps.projects.values()].map((p) => p.id);
  const seatTaken = new Map<string, string>(); // "<mesa>|<lugar>" → inscrição
  for (const s of await tx.seatAssignment.findMany({
    where: { table: { projectId: { in: projectIds } } },
    select: { registrationId: true, tableId: true, seat: true },
  }))
    if (s.seat !== null) seatTaken.set(`${s.tableId}|${s.seat}`, s.registrationId);

  const done = new Set<string>();
  for (const i of src.rows("Invite")) {
    report.read("EventInvite");
    const project = ctx.maps.projects.get(i.str("tripId"));
    const registrationId = ctx.maps.registrations.get(`Invite:${i.str("id")}`);
    if (!project || !registrationId || done.has(registrationId)) {
      report.skipped("EventInvite");
      continue;
    }
    const exists = await tx.registration.findUnique({
      where: { id: registrationId },
      select: { id: true },
    });
    if (!exists) {
      report.skipped("EventInvite");
      report.warn(
        "MISSING_REFERENCE",
        "Invite",
        i.str("id"),
        "Inscrição não gravada (rode a etapa inscricoes).",
      );
      continue;
    }
    done.add(registrationId);
    const kind = convert(INVITE_KIND, i.str("kind"), "COMPANY_GUEST");
    if (!kind.known)
      report.warn("LOSSY_CONVERSION", "Invite", i.str("id"), `Tipo "${kind.raw}" → COMPANY_GUEST.`);
    const companyId = i.ref("companyId");
    const companyQuotaId =
      companyId && companyNames.has(companyId) ? (ctx.maps.quotas.get(companyId) ?? null) : null;
    const data = {
      companyQuotaId,
      kind: kind.value,
      sentAt: firstSent.get(i.str("id")) ?? null,
    };
    const before = await tx.eventInvite.findUnique({
      where: { registrationId },
      select: { registrationId: true },
    });
    await tx.eventInvite.upsert({
      where: { registrationId },
      create: {
        registrationId,
        tenantId: tenant.id,
        projectId: project.id,
        createdAt: instant(i.date("createdAt")) ?? undefined,
        ...data,
      },
      update: data,
    });
    report.saved("EventInvite", !!before);

    const legacyTable = i.ref("tableId");
    if (legacyTable) {
      report.read("SeatAssignment");
      const tableId = ctx.maps.tables.get(legacyTable);
      if (!tableId) {
        report.skipped("SeatAssignment");
        report.warn(
          "MISSING_REFERENCE",
          "Invite",
          i.str("id"),
          "Mesa do convidado não encontrada.",
        );
        continue;
      }
      let seat = i.int("seat");
      if (seat !== null) {
        const owner = seatTaken.get(`${tableId}|${seat}`);
        if (owner && owner !== registrationId) {
          report.warn(
            "CONFLICT",
            "Invite",
            i.str("id"),
            `Lugar ${seat} da mesa já ocupado: convidado na mesa sem lugar definido.`,
          );
          seat = null;
        } else seatTaken.set(`${tableId}|${seat}`, registrationId);
      }
      const sb = await tx.seatAssignment.findUnique({
        where: { registrationId },
        select: { registrationId: true },
      });
      await tx.seatAssignment.upsert({
        where: { registrationId },
        create: { registrationId, tableId, seat },
        update: { tableId, seat },
      });
      report.saved("SeatAssignment", !!sb);
    }
  }

  // Histórico de envios → MessageDelivery (sem campanha, sem fila)
  const inviteRows = new Map(src.rows("Invite").map((i) => [i.str("id"), i]));
  for (const d of deliveries) {
    report.read("MessageDelivery");
    const invite = inviteRows.get(d.str("inviteId"));
    const registrationId = ctx.maps.registrations.get(`Invite:${d.str("inviteId")}`) ?? null;
    if (!invite) {
      report.skipped("MessageDelivery");
      continue;
    }
    const channel = convert(DELIVERY_CHANNEL, d.str("channel"), "EMAIL");
    const status = convert(DELIVERY_STATUS, d.str("status"), "FAILED");
    if (!status.known)
      report.warn(
        "LOSSY_CONVERSION",
        "InviteDelivery",
        d.str("id"),
        `Status "${status.raw}" → FAILED.`,
      );
    const createdAt = instant(d.date("createdAt")) ?? new Date();
    const id = idOf(ctx, "InviteDelivery", d.str("id"));
    const data = {
      channel: channel.value,
      personId: ctx.maps.people.get(keyOf(ctx, "Invite", d.str("inviteId"))) ?? null,
      registrationId,
      recipientName: invite.str("name"),
      target: d.str("target") || "—",
      status: status.value,
      attempts: 1,
      subject: "Convite (histórico do sistema anterior)",
      bodyPreview: status.value === "FAILED" ? "" : d.str("detail").slice(0, 300),
      error: status.value === "FAILED" ? d.str("detail") : "",
      sentAt: status.value === "SENT" ? createdAt : null,
    };
    const before = await tx.messageDelivery.findUnique({ where: { id }, select: { id: true } });
    await tx.messageDelivery.upsert({
      where: { id },
      create: {
        id,
        tenantId: tenant.id,
        dedupeKey: `legado:${ctx.prefix}:${d.str("id")}`,
        createdAt,
        ...data,
      },
      update: data,
    });
    report.saved("MessageDelivery", !!before);
  }
}

/** Personalização das mensagens do evento → MessageTemplate (INVITE / INVITE_CANCEL) + canal. */
async function migrateTemplates(ctx: Ctx, t: Row, projectId: string) {
  const { tx, report, tenant } = ctx;
  const tripId = t.str("id");
  const convertField = (field: string, text: string) => {
    const c = convertPlaceholders(text);
    if (c.unknown.length)
      report.warn(
        "LOSSY_CONVERSION",
        "Trip",
        tripId,
        `${field}: campos sem equivalente mantidos como estão: ${c.unknown.join(", ")}.`,
      );
    return c.text;
  };

  const body = [t.str("emailText").trim(), t.str("emailFooter").trim()]
    .filter(Boolean)
    .join("\n\n");
  const invite = {
    subject: t.str("emailTitle").trim(),
    body,
    whatsapp: t.str("whatsappTemplate").trim(),
  };
  const save = async (
    purpose: "INVITE" | "INVITE_CANCEL",
    name: string,
    emailSubject: string,
    emailBody: string,
    whatsappBody: string,
  ) => {
    const id = idOf(ctx, "MessageTemplate", `${tripId}:${purpose}`);
    report.read("MessageTemplate");
    const data = {
      name,
      emailSubject: convertField("Assunto do e-mail", emailSubject),
      emailBody: convertField("Texto do e-mail", emailBody),
      whatsappBody: convertField("Modelo do WhatsApp", whatsappBody),
    };
    const before = await tx.messageTemplate.findUnique({ where: { id }, select: { id: true } });
    await tx.messageTemplate.upsert({
      where: { id },
      create: { id, tenantId: tenant.id, projectId, purpose, ...data },
      update: data,
    });
    report.saved("MessageTemplate", !!before);
  };
  if (invite.subject || invite.body || invite.whatsapp)
    await save(
      "INVITE",
      "Convite (sistema anterior)",
      invite.subject,
      invite.body,
      invite.whatsapp,
    );
  const cancel = t.str("cancelTemplate").trim();
  if (cancel) await save("INVITE_CANCEL", "Cancelamento (sistema anterior)", "", cancel, cancel);

  const replyTo = t.str("replyTo").trim().toLowerCase();
  if (replyTo) {
    const id = idOf(ctx, "MessagingChannel", tripId);
    report.read("MessagingChannel");
    const before = await tx.messagingChannel.findUnique({ where: { id }, select: { id: true } });
    await tx.messagingChannel.upsert({
      where: { id },
      // Sem SMTP próprio: usa o servidor global com o Reply-To do evento
      create: {
        id,
        tenantId: tenant.id,
        projectId,
        kind: "EMAIL",
        name: "E-mail do evento (sistema anterior)",
        replyTo,
      },
      update: { replyTo },
    });
    report.saved("MessagingChannel", !!before);
  }
}
