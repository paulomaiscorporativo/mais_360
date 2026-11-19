import { foldText, personSearchText } from "@mais/core";
import type { Prisma } from "@mais/db";
import { idOf, keyOf, on, type Ctx } from "../context";
import {
  USER_ROLE,
  convert,
  instant,
  calendarNoon,
  isBcryptHash,
  legacyKeysOf,
  normalizePerson,
  planPeople,
  withLegacyKeys,
  type PersonCandidate,
  type PersonFields,
} from "../rules";
import type { Row } from "../source";

/**
 * Núcleo: equipe (User + Membership), empresas (Organization) e pessoas
 * (associados, passageiros e convidados deduplicados numa Person só).
 */

/** E-mails da equipe Mais: viram também administradores do assinante. */
const MAIS_TEAM = /@(maiscorporativo\.tur\.br|mais\.tur\.br)$/i;

/** Hash que nunca confere: conta sem senha utilizável (força redefinição). */
const UNUSABLE_HASH = "!migrado-sem-senha";

export async function migrateUsers(ctx: Ctx) {
  const { tx, src, report, tenant } = ctx;
  for (const u of src.rows("User")) {
    report.read("User");
    const email = u.str("email").trim().toLowerCase();
    if (!email) {
      report.skipped("User");
      report.warn("INVALID_DATA", "User", u.str("id"), "Usuário sem e-mail: não migrado.");
      continue;
    }
    const found = await tx.user.findUnique({ where: { email }, select: { id: true } });
    const ownId = idOf(ctx, "User", u.str("id"));
    const userId = found?.id ?? ownId;
    ctx.maps.users.set(u.str("id"), userId);
    if (!on(ctx, "nucleo")) continue;

    const hash = u.str("passwordHash");
    const validHash = isBcryptHash(hash);
    if (!validHash)
      report.warn(
        "INVALID_DATA",
        "User",
        u.str("id"),
        "Senha em formato desconhecido: a conta precisará redefinir a senha.",
      );
    if (!found) {
      await tx.user.create({
        data: {
          id: userId,
          email,
          name: u.str("name").trim() || email,
          passwordHash: validHash ? hash : UNUSABLE_HASH,
          mustChangePassword: !validHash,
          active: u.bool("active", true),
          createdAt: instant(u.date("createdAt")) ?? undefined,
        },
      });
      report.created("User");
    } else if (found.id === ownId) {
      // Conta criada por migração anterior: acompanha o legado
      await tx.user.update({
        where: { id: userId },
        data: { name: u.str("name").trim() || email, active: u.bool("active", true) },
      });
      report.updated("User");
    } else {
      // Conta que já existia na plataforma: não mexe em senha nem nome
      report.updated("User");
      report.merge("User", keyOf(ctx, "User", u.str("id")), userId, "EMAIL");
    }

    const role = convert(USER_ROLE, u.str("role"), "VIEWER");
    if (!role.known)
      report.warn("LOSSY_CONVERSION", "User", u.str("id"), `Papel "${role.raw}" → VIEWER.`);
    const membershipId = idOf(ctx, "Membership", u.str("id"));
    const membership = await tx.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId } },
      select: { id: true },
    });
    if (!membership) {
      await tx.membership.create({
        data: {
          id: membershipId,
          tenantId: tenant.id,
          userId,
          role: role.value,
          allProjects: u.bool("allTrips", true),
        },
      });
      report.created("Membership");
    } else if (membership.id === membershipId) {
      await tx.membership.update({
        where: { id: membershipId },
        data: { role: role.value, allProjects: u.bool("allTrips", true) },
      });
      report.updated("Membership");
    } else {
      // Vínculo criado na plataforma nova: o papel atual prevalece
      report.updated("Membership");
    }

    if (role.value === "ADMIN" && MAIS_TEAM.test(email)) {
      const wm = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: tenant.workspaceId, userId } },
      });
      if (!wm) {
        await tx.workspaceMember.create({
          data: { workspaceId: tenant.workspaceId, userId, role: "ADMIN" },
        });
        report.created("WorkspaceMember");
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Organizações
// ---------------------------------------------------------------------------

const digits = (v: string) => v.replace(/\D/g, "");

export function orgKeys(name: string, cnpj: string): { primary: string; aliases: string[] } {
  const doc = digits(cnpj);
  const byName = foldText(name) ? `nome:${foldText(name)}` : "";
  if (doc.length === 14 && !/^0+$/.test(doc.slice(0, 8)))
    return { primary: `cnpj:${doc}`, aliases: byName ? [byName] : [] };
  return { primary: byName, aliases: [] };
}

/** Empresa (nome/CNPJ) → id da organização, se conhecida. */
export function orgIdFor(ctx: Ctx, name: string, cnpj = ""): string | null {
  const k = orgKeys(name, cnpj);
  return (k.primary && ctx.maps.orgs.get(k.primary)) || null;
}

export async function migrateOrganizations(ctx: Ctx) {
  const { tx, src, report, tenant } = ctx;
  const existing = await tx.organization.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, document: true },
  });
  for (const o of existing) {
    const k = orgKeys(o.name, o.document);
    for (const key of [k.primary, ...k.aliases])
      if (key && !ctx.maps.orgs.has(key)) ctx.maps.orgs.set(key, o.id);
  }

  type Cand = { name: string; cnpj: string; email: string; phone: string; source: string };
  const cands: Cand[] = [];
  for (const a of src.rows("Associate"))
    if (a.str("companyName").trim())
      cands.push({
        name: a.str("companyName").trim(),
        cnpj: a.str("cnpj"),
        email: "",
        phone: "",
        source: keyOf(ctx, "Associate", a.str("id")),
      });
  for (const c of src.rows("EventCompany"))
    cands.push({
      name: c.str("companyName").trim(),
      cnpj: "",
      email: c.str("email").trim(),
      phone: c.str("phone").trim(),
      source: keyOf(ctx, "EventCompany", c.str("id")),
    });
  for (const r of src.rows("TravelRequest"))
    if (r.str("companyName").trim())
      cands.push({
        name: r.str("companyName").trim(),
        cnpj: "",
        email: "",
        phone: "",
        source: keyOf(ctx, "TravelRequest", r.str("id")),
      });

  const seen = new Set<string>();
  for (const c of cands) {
    if (!c.name) continue;
    const k = orgKeys(c.name, c.cnpj);
    if (!k.primary) continue;
    // Empresa com CNPJ que já apareceu só pelo nome (ou vice-versa): mesma organização
    const known =
      ctx.maps.orgs.get(k.primary) ?? k.aliases.map((a) => ctx.maps.orgs.get(a)).find(Boolean);
    const id = known ?? idOf(ctx, "Organization", k.primary);
    for (const key of [k.primary, ...k.aliases])
      if (!ctx.maps.orgs.has(key)) ctx.maps.orgs.set(key, id);
    if (seen.has(id)) continue;
    seen.add(id);
    report.read("Organization");
    if (!on(ctx, "nucleo")) continue;

    const doc = digits(c.cnpj);
    const current = await tx.organization.findUnique({ where: { id } });
    if (!current) {
      await tx.organization.create({
        data: {
          id,
          tenantId: tenant.id,
          name: c.name,
          document: doc.length === 14 ? doc : "",
          email: c.email,
          phone: c.phone,
        },
      });
      report.created("Organization");
    } else {
      await tx.organization.update({
        where: { id },
        data: {
          document: current.document || (doc.length === 14 ? doc : ""),
          email: current.email || c.email,
          phone: current.phone || c.phone,
        },
      });
      report.updated("Organization");
    }
  }
}

// ---------------------------------------------------------------------------
// Pessoas
// ---------------------------------------------------------------------------

type Source = { row: Row; model: "Associate" | "Passenger" | "Invite" };

function personInput(s: Source) {
  const r = s.row;
  if (s.model === "Associate") {
    return normalizePerson({
      name: r.str("name"),
      email: r.str("email"),
      phone: r.str("phone"),
      isMember: true,
      memberType: r.str("role"),
      passwordHash: r.str("passwordHash"),
      mustChangePassword: r.bool("mustChangePassword", true),
      lastLoginAt: instant(r.date("lastLoginAt")),
    });
  }
  if (s.model === "Passenger") {
    return normalizePerson({
      name: r.str("name"),
      email: r.str("email"),
      phone: r.str("phone"),
      cpf: r.str("cpf"),
      birthDate: calendarNoon(r.date("birthDate")),
      passportNumber: r.str("passportNumber"),
      passportExpiry: calendarNoon(r.date("passportExpiry")),
      rg: r.str("rg"),
      city: r.str("city"),
      state: r.str("uf"),
      dietary: r.str("dietary"),
      medicalNotes: r.str("medicalNotes"),
      emergencyName: r.str("emergencyName"),
      emergencyPhone: r.str("emergencyPhone"),
    });
  }
  return normalizePerson({
    name: r.str("name"),
    email: r.str("email"),
    phone: r.str("phone"),
    jobTitle: r.str("role"),
  });
}

const ISSUE_TEXT = {
  email: "E-mail inválido descartado",
  phone: "Telefone inválido (guardado em customFields.telefoneOriginal)",
  emergencyPhone: "Telefone de emergência fora do padrão (mantido como digitado)",
  cpf: "CPF inválido (mantido, mas não usado para deduplicar)",
  name: 'Registro sem nome (gravado como "Sem nome")',
} as const;

export async function migratePeople(ctx: Ctx) {
  const { tx, src, report, tenant } = ctx;

  // Ordem de prioridade: conta do associado > passageiros (titulares antes) > convidados
  const passengers = [...src.rows("Passenger")].sort(
    (a, b) => Number(a.str("type") === "ACOMPANHANTE") - Number(b.str("type") === "ACOMPANHANTE"),
  );
  const sources: Source[] = [
    ...src.rows("Associate").map((row) => ({ row, model: "Associate" as const })),
    ...passengers.map((row) => ({ row, model: "Passenger" as const })),
    ...src.rows("Invite").map((row) => ({ row, model: "Invite" as const })),
  ];

  const candidates: PersonCandidate[] = [];
  const phoneOriginal = new Map<string, string>();
  for (const s of sources) {
    report.read(`Person ← ${s.model}`);
    const n = personInput(s);
    const key = keyOf(ctx, s.model, s.row.str("id"));
    for (const issue of n.issues) {
      report.warn(
        "INVALID_DATA",
        s.model,
        s.row.str("id"),
        `${ISSUE_TEXT[issue.field]}: "${issue.raw}".`,
      );
      if (issue.field === "phone") phoneOriginal.set(key, issue.raw);
    }
    if (s.model === "Associate" && s.row.str("passwordHash") && !n.fields.passwordHash)
      report.warn(
        "INVALID_DATA",
        "Associate",
        s.row.str("id"),
        "Senha em formato desconhecido: não migrada.",
      );
    candidates.push({ key, fields: n.fields });
  }

  const existing = await tx.person.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, cpf: true, email: true, phone: true, externalIds: true },
  });
  const plan = planPeople(
    candidates,
    existing.map((p) => ({ ...p, legacyKeys: legacyKeysOf(p.externalIds) })),
    (key) => idOf(ctx, "Person", key),
  );
  for (const [k, v] of plan.byKey) ctx.maps.people.set(k, v);
  for (const m of plan.merges) report.merge("Person", m.key, m.intoId, m.reason);

  // Organização principal: associado → empresa; convidado de empresa → empresa da cota
  const companies = new Map(src.rows("EventCompany").map((c) => [c.str("id"), c]));
  const links: { personId: string; orgId: string; role: string }[] = [];
  for (const a of src.rows("Associate")) {
    const personId = ctx.maps.people.get(keyOf(ctx, "Associate", a.str("id")));
    const orgId = orgIdFor(ctx, a.str("companyName"), a.str("cnpj"));
    if (personId && orgId) links.push({ personId, orgId, role: "" });
  }
  for (const i of src.rows("Invite")) {
    const company = companies.get(i.str("companyId"));
    const personId = ctx.maps.people.get(keyOf(ctx, "Invite", i.str("id")));
    const orgId = company ? orgIdFor(ctx, company.str("companyName")) : null;
    if (personId && orgId) links.push({ personId, orgId, role: i.str("role").trim() });
  }
  for (const l of links)
    if (!ctx.maps.personOrg.has(l.personId)) ctx.maps.personOrg.set(l.personId, l.orgId);

  const passengersWithPin = src.rows("Passenger").filter((p) => p.str("pin")).length;
  if (passengersWithPin)
    report.note(
      `${passengersWithPin} PIN(s) do portal do passageiro NÃO foram migrados como senha (o PIN padrão era o CPF). O viajante entra pelo link pessoal do portal novo.`,
    );
  const pendingInvites = src.rows("AssociateInvite").filter((i) => !i.date("usedAt"));
  for (const i of pendingInvites)
    report.warn(
      "NOT_MIGRATED",
      "AssociateInvite",
      i.str("id"),
      `Convite de primeiro acesso pendente para ${i.str("email")}: reemitir pela plataforma.`,
    );
  report.read("AssociateInvite", src.rows("AssociateInvite").length);
  report.skipped("AssociateInvite", src.rows("AssociateInvite").length);

  if (!on(ctx, "nucleo")) return;

  const orgNames = new Map(
    (
      await tx.organization.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, name: true },
      })
    ).map((o) => [o.id, o.name]),
  );
  const ids = plan.people.map((p) => p.id);
  const currentRows = await tx.person.findMany({ where: { id: { in: ids } } });
  const current = new Map(currentRows.map((p) => [p.id, p]));

  for (const p of plan.people) {
    const before = current.get(p.id);
    const migratedBefore = before ? legacyKeysOf(before.externalIds).length > 0 : false;
    // Pessoa cadastrada na plataforma nova: legado só preenche lacunas
    const f: PersonFields = before && !migratedBefore ? fillBlanks(before, p.fields) : p.fields;
    const orgId = ctx.maps.personOrg.get(p.id);
    const searchText = personSearchText({
      ...f,
      organizations: orgId && orgNames.get(orgId) ? [orgNames.get(orgId)!] : [],
    });
    const original = p.keys.map((k) => phoneOriginal.get(k)).find(Boolean);
    const customFields = {
      ...(before?.customFields &&
      typeof before.customFields === "object" &&
      !Array.isArray(before.customFields)
        ? (before.customFields as Record<string, unknown>)
        : {}),
      ...(original && !f.phone ? { telefoneOriginal: original } : {}),
    };
    const keepPassword = before?.passwordHash && !migratedBefore;
    const data = {
      memberType: f.memberType,
      isMember: f.isMember || (before?.isMember ?? false),
      firstName: f.firstName,
      lastName: f.lastName,
      badgeName: f.badgeName,
      email: f.email,
      emailNorm: f.emailNorm,
      phone: f.phone,
      cpf: f.cpf,
      birthDate: f.birthDate,
      jobTitle: f.jobTitle,
      city: f.city,
      state: f.state,
      passportNumber: f.passportNumber,
      passportExpiry: f.passportExpiry,
      rg: f.rg,
      dietary: f.dietary,
      medicalNotes: f.medicalNotes,
      emergencyName: f.emergencyName,
      emergencyPhone: f.emergencyPhone,
      ...(keepPassword
        ? {}
        : { passwordHash: f.passwordHash, mustChangePassword: f.mustChangePassword }),
      lastLoginAt: f.lastLoginAt ?? before?.lastLoginAt ?? null,
      searchText,
      customFields: customFields as Prisma.InputJsonValue,
      externalIds: withLegacyKeys(before?.externalIds, p.keys) as Prisma.InputJsonValue,
    };
    if (before) {
      await tx.person.update({ where: { id: p.id }, data });
      report.updated("Person");
    } else {
      await tx.person.create({ data: { id: p.id, tenantId: tenant.id, ...data } });
      report.created("Person");
    }
  }

  const seen = new Set<string>();
  for (const l of links) {
    const k = `${l.personId}|${l.orgId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const before = await tx.personOrganization.findUnique({
      where: { personId_organizationId: { personId: l.personId, organizationId: l.orgId } },
    });
    await tx.personOrganization.upsert({
      where: { personId_organizationId: { personId: l.personId, organizationId: l.orgId } },
      create: {
        personId: l.personId,
        organizationId: l.orgId,
        role: l.role,
        primary: ctx.maps.personOrg.get(l.personId) === l.orgId,
      },
      update: { role: before?.role || l.role },
    });
    report.saved("PersonOrganization", !!before);
  }
}

function fillBlanks(before: Record<string, unknown>, legacy: PersonFields): PersonFields {
  const out = { ...legacy };
  for (const k of Object.keys(legacy) as (keyof PersonFields)[]) {
    const v = before[k];
    if (v !== null && v !== undefined && v !== "" && v !== false)
      (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
