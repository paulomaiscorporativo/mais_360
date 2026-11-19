import "server-only";
import {
  cleanText,
  defaultBadgeName,
  findDuplicate,
  foldText,
  identityKeys,
  isValidCpf,
  normalizeCpf,
  normalizeEmail,
  normalizePhone,
  personSearchText,
} from "@mais/core";
import type { Person, Prisma } from "@mais/db";
import type { TenantDb } from "./tenant-db";

/**
 * Cadastro único de pessoas por cliente. Toda criação passa por `upsertPerson`,
 * que deduplica por CPF > e-mail > telefone (regra em @mais/core/people).
 */

export type PersonInput = {
  firstName: string;
  lastName?: string;
  badgeName?: string;
  email?: string;
  phone?: string;
  cpf?: string;
  jobTitle?: string;
  city?: string;
  state?: string;
  organization?: string;
  memberType?: string;
  isMember?: boolean;
  externalIds?: Record<string, string>;
};

/** Normaliza a entrada para os campos do banco. */
export function normalizePersonInput(input: PersonInput) {
  const email = normalizeEmail(input.email);
  const cpf = normalizeCpf(input.cpf);
  const phone = normalizePhone(input.phone)?.e164 ?? "";
  const firstName = cleanText(input.firstName);
  const lastName = cleanText(input.lastName);
  return {
    firstName,
    lastName,
    badgeName: cleanText(input.badgeName) || defaultBadgeName(firstName, lastName),
    email,
    emailNorm: email,
    phone,
    cpf: isValidCpf(cpf) ? cpf : cpf.length === 11 ? cpf : "",
    jobTitle: cleanText(input.jobTitle),
    city: cleanText(input.city),
    state: cleanText(input.state).toUpperCase().slice(0, 2),
  };
}

async function candidates(db: TenantDb, input: PersonInput) {
  const k = identityKeys(input);
  const phone = normalizePhone(input.phone);
  const or: Prisma.PersonWhereInput[] = [];
  if (k.cpf) or.push({ cpf: k.cpf });
  if (k.email) or.push({ emailNorm: k.email });
  if (phone) {
    // mesmo celular com e sem o 9º dígito
    const alt = phone.identity !== phone.e164 ? [phone.identity, phone.e164] : [phone.e164];
    if (phone.isBrazil && phone.identity.length === 13) {
      alt.push(phone.identity.slice(0, 4) + phone.identity.slice(5));
    }
    or.push({ phone: { in: alt } });
  }
  if (!or.length) return [];
  return db.person.findMany({ where: { archivedAt: null, OR: or }, take: 20 });
}

export async function findExistingPerson(db: TenantDb, input: PersonInput) {
  return findDuplicate(input, await candidates(db, input));
}

async function linkOrganization(
  db: TenantDb,
  tenantId: string,
  personId: string,
  name: string,
  role: string,
) {
  const clean = cleanText(name);
  if (!clean) return;
  const folded = foldText(clean);
  const orgs = await db.organization.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true },
  });
  let org = orgs.find((o) => foldText(o.name) === folded);
  if (!org)
    org = await db.organization.create({
      data: { tenantId, name: clean },
      select: { id: true, name: true },
    });
  await db.personOrganization.upsert({
    where: { personId_organizationId: { personId, organizationId: org.id } },
    create: { personId, organizationId: org.id, role, primary: true },
    update: {},
  });
}

/**
 * Cria a pessoa ou devolve a existente (preenchendo só campos vazios —
 * nunca sobrescreve dado bom com dado pior). `created` indica se é nova.
 */
export async function upsertPerson(
  db: TenantDb,
  tenantId: string,
  input: PersonInput,
): Promise<{ person: Person; created: boolean }> {
  const data = normalizePersonInput(input);
  if (!data.firstName) throw new Error("Pessoa sem nome.");
  const match = await findExistingPerson(db, input);

  if (match) {
    const p = match.person;
    const fill: Prisma.PersonUpdateInput = {};
    for (const key of [
      "lastName",
      "email",
      "emailNorm",
      "phone",
      "cpf",
      "jobTitle",
      "city",
      "state",
    ] as const) {
      if (!p[key] && data[key]) fill[key] = data[key];
    }
    if (input.isMember && !p.isMember) fill.isMember = true;
    if (input.memberType && !p.memberType) fill.memberType = input.memberType;
    const person = Object.keys(fill).length
      ? await db.person.update({ where: { id: p.id }, data: fill })
      : p;
    if (input.organization)
      await linkOrganization(db, tenantId, person.id, input.organization, data.jobTitle);
    await refreshSearch(db, person.id);
    return { person, created: false };
  }

  const person = await db.person.create({
    data: {
      tenantId,
      ...data,
      isMember: input.isMember ?? false,
      memberType: input.memberType ?? "",
      externalIds: input.externalIds ?? {},
      searchText: personSearchText({
        ...data,
        organizations: input.organization ? [input.organization] : [],
      }),
    },
  });
  if (input.organization)
    await linkOrganization(db, tenantId, person.id, input.organization, data.jobTitle);
  return { person, created: true };
}

/** Recalcula o texto de busca (nome, e-mail, CPF, cargo, cidade, empresas). */
export async function refreshSearch(db: TenantDb, personId: string) {
  const p = await db.person.findFirst({
    where: { id: personId },
    include: { organizations: { include: { organization: true } } },
  });
  if (!p) return;
  await db.person.update({
    where: { id: p.id },
    data: {
      searchText: personSearchText({
        ...p,
        organizations: p.organizations.map((o) => o.organization.name),
      }),
    },
  });
}
