import { randomInt } from "node:crypto";
import { cleanText, foldText, makeShortCode, makeToken } from "@mais/core";
import type { Prisma, RegistrationRole, RegistrationSource, RegistrationStatus } from "@mais/db";
import { idOf, keyOf, legacyJson, on, type Ctx } from "../context";
import { INVITE_STATUS, PASSENGER_ROLE, RSVP_STATUS, convert, instant } from "../rules";
import type { Row } from "../source";

/**
 * Inscrições: Passenger (viajantes e acompanhantes) e Invite (convidados).
 * Os tokens e códigos curtos dos convites são PRESERVADOS — QR codes impressos
 * e links já enviados continuam valendo. Passageiros (que não tinham token)
 * ganham token/código novos uma única vez; reexecuções mantêm os já gravados.
 */

type Planned = {
  model: "Passenger" | "Invite";
  row: Row;
  id: string;
  projectId: string;
  personId: string;
  role: RegistrationRole;
};

export async function migrateRegistrations(ctx: Ctx) {
  const { tx, src, report, tenant } = ctx;
  const projectIds = [...ctx.maps.projects.values()].map((p) => p.id);

  const existing = await tx.registration.findMany({
    where: { tenantId: tenant.id, projectId: { in: projectIds } },
    select: { id: true, projectId: true, personId: true, role: true, token: true, shortCode: true },
  });
  const byId = new Map(existing.map((r) => [r.id, r]));
  const slot = new Map(existing.map((r) => [`${r.projectId}|${r.personId}|${r.role}`, r.id]));
  const codes = new Map<string, Map<string, string>>(); // projeto → código → id
  for (const r of existing) {
    if (!codes.has(r.projectId)) codes.set(r.projectId, new Map());
    codes.get(r.projectId)!.set(r.shortCode, r.id);
  }
  const codesOf = (projectId: string) => {
    let m = codes.get(projectId);
    if (!m) codes.set(projectId, (m = new Map()));
    return m;
  };

  // Convites primeiro: os códigos antigos têm prioridade sobre os gerados
  const planned: Planned[] = [];
  const consider = (model: Planned["model"], row: Row, role: RegistrationRole) => {
    report.read(`Registration ← ${model}`);
    const project = ctx.maps.projects.get(row.str("tripId"));
    const personId = ctx.maps.people.get(keyOf(ctx, model, row.str("id")));
    if (!project || !personId) {
      report.skipped(`Registration ← ${model}`);
      report.warn("MISSING_REFERENCE", model, row.str("id"), "Projeto ou pessoa não encontrados.");
      return;
    }
    const id = idOf(ctx, model, row.str("id"));
    const k = `${project.id}|${personId}|${role}`;
    const taken = slot.get(k);
    if (taken && taken !== id) {
      // A mesma pessoa duas vezes no mesmo projeto e papel: vira uma inscrição só
      ctx.maps.registrations.set(`${model}:${row.str("id")}`, taken);
      report.merge(
        "Registration",
        keyOf(ctx, model, row.str("id")),
        taken,
        "MESMA_PESSOA_NO_PROJETO",
      );
      report.skipped(`Registration ← ${model}`);
      return;
    }
    slot.set(k, id);
    ctx.maps.registrations.set(`${model}:${row.str("id")}`, id);
    planned.push({ model, row, id, projectId: project.id, personId, role });
  };

  for (const i of src.rows("Invite")) consider("Invite", i, "GUEST");
  // Titulares antes dos acompanhantes (companionOfId aponta para inscrição já gravada)
  const passengers = [...src.rows("Passenger")].sort(
    (a, b) => Number(a.str("type") === "ACOMPANHANTE") - Number(b.str("type") === "ACOMPANHANTE"),
  );
  for (const p of passengers) {
    const role = convert(PASSENGER_ROLE, p.str("type"), "TRAVELER");
    if (!role.known)
      report.warn("LOSSY_CONVERSION", "Passenger", p.str("id"), `Tipo "${role.raw}" → TRAVELER.`);
    consider("Passenger", p, role.value);
  }

  if (!on(ctx, "inscricoes")) return;

  // Tokens dos convites: únicos na plataforma inteira
  const inviteTokens = planned.filter((p) => p.model === "Invite").map((p) => p.row.str("token"));
  const tokenOwners = new Map(
    (
      await tx.registration.findMany({
        where: { token: { in: inviteTokens.filter(Boolean) } },
        select: { id: true, token: true },
      })
    ).map((r) => [r.token, r.id]),
  );

  const companies = new Map(src.rows("EventCompany").map((c) => [c.str("id"), c]));
  const newCode = (projectId: string) =>
    makeShortCode(
      (max) => randomInt(max),
      (c) => codesOf(projectId).has(c),
    );

  for (const p of planned) {
    const r = p.row;
    const legacyId = r.str("id");
    const before = byId.get(p.id);
    const codesHere = codesOf(p.projectId);

    // --- token e código curto
    let token = before?.token ?? "";
    let shortCode = before?.shortCode ?? "";
    if (p.model === "Invite") {
      const legacyToken = r.str("token").trim();
      const owner = tokenOwners.get(legacyToken);
      if (legacyToken && (!owner || owner === p.id)) token = legacyToken;
      else if (!before) {
        token = makeToken((max) => randomInt(max));
        report.warn(
          "CONFLICT",
          "Invite",
          legacyId,
          "Token do convite já usado por outra inscrição: link antigo não valerá.",
        );
      }
      const legacyCode = r.str("code").trim();
      const codeOwner = codesHere.get(legacyCode);
      if (/^\d{4,8}$/.test(legacyCode) && (!codeOwner || codeOwner === p.id))
        shortCode = legacyCode;
      else if (!before) {
        shortCode = newCode(p.projectId);
        if (legacyCode)
          report.warn(
            "CONFLICT",
            "Invite",
            legacyId,
            `Código curto "${legacyCode}" inválido ou repetido no evento: gerado ${shortCode}.`,
          );
      }
    }
    if (!token) token = makeToken((max) => randomInt(max));
    if (!shortCode) shortCode = newCode(p.projectId);
    codesHere.set(shortCode, p.id);

    // --- status e dados próprios
    let status: RegistrationStatus;
    let checkedInAt: Date | null = null;
    let notes = r.str("notes");
    let source: RegistrationSource = "IMPORT";
    let displayCompany = "";
    let displayJobTitle = "";
    let categoryId: string | null = null;
    let groupId: string | null = null;
    let companionOfId: string | null = null;

    if (p.model === "Invite") {
      const st = convert(INVITE_STATUS, r.str("status"), "PENDING");
      if (!st.known)
        report.warn("LOSSY_CONVERSION", "Invite", legacyId, `Status "${st.raw}" → PENDING.`);
      status = st.value;
      checkedInAt = instant(r.date("checkedInAt"));
      if (st.raw === "CREDENCIADO" && !checkedInAt) {
        checkedInAt = instant(r.date("updatedAt"));
        report.warn(
          "LOSSY_CONVERSION",
          "Invite",
          legacyId,
          "Credenciado sem horário: usado o da última alteração.",
        );
      }
      const company = companies.get(r.str("companyId"));
      source = company ? "COMPANY_QUOTA" : "MANUAL";
      displayCompany = company?.str("companyName") ?? "";
      displayJobTitle = cleanText(r.str("role"));
    } else {
      const st = convert(RSVP_STATUS, r.str("rsvpStatus"), "PENDING");
      if (!st.known)
        report.warn("LOSSY_CONVERSION", "Passenger", legacyId, `Status "${st.raw}" → PENDING.`);
      status = st.value;
      if (r.bool("blocked")) {
        status = "CANCELED";
        notes = [notes, "Bloqueado no sistema anterior."].filter(Boolean).join("\n");
      }
      const cat = cleanText(r.str("category"));
      categoryId = cat
        ? (ctx.maps.categories.get(`${r.str("tripId")}:${foldText(cat)}`) ?? null)
        : null;
      groupId = r.ref("groupId") ? (ctx.maps.groups.get(r.str("groupId")) ?? null) : null;
      if (p.role === "COMPANION") {
        const titular = r.ref("titularId");
        companionOfId = titular
          ? (ctx.maps.registrations.get(`Passenger:${titular}`) ?? null)
          : null;
        if (!companionOfId)
          report.warn(
            "MISSING_REFERENCE",
            "Passenger",
            legacyId,
            "Acompanhante sem titular encontrado.",
          );
      }
    }

    const data = {
      role: p.role,
      status,
      source,
      categoryId,
      groupId,
      companionOfId,
      displayCompany,
      displayJobTitle,
      token,
      shortCode,
      checkedInAt,
      checkedInBy: checkedInAt ? "sistema anterior" : "",
      confirmedAt: instant(r.date("confirmedAt")),
      canceledAt: instant(r.date("canceledAt")),
      canceledBy: r.str("canceledBy"),
      formFilledAt: instant(r.date("formFilledAt")),
      notes,
      customFields: legacyJson(ctx, p.model, legacyId) as Prisma.InputJsonValue,
    };
    if (before) await tx.registration.update({ where: { id: p.id }, data });
    else
      await tx.registration.create({
        data: {
          id: p.id,
          tenantId: tenant.id,
          projectId: p.projectId,
          personId: p.personId,
          createdAt: instant(r.date("createdAt")) ?? undefined,
          ...data,
        },
      });
    report.saved("Registration", !!before);
  }
}
