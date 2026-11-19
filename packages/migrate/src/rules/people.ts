import {
  cleanText,
  defaultBadgeName,
  findDuplicate,
  isValidCpf,
  normalizeCpf,
  normalizeEmail,
  normalizePhone,
  splitFullName,
} from "@mais/core";

/**
 * Pessoas: normalização dos dados vindos de Associate, Passenger e Invite e
 * deduplicação por cliente (CPF → e-mail normalizado → telefone E.164).
 * A mesma pessoa vinda de várias tabelas vira UMA Person.
 */

export type PersonFields = {
  firstName: string;
  lastName: string;
  badgeName: string;
  email: string;
  emailNorm: string;
  phone: string;
  cpf: string;
  birthDate: Date | null;
  jobTitle: string;
  city: string;
  state: string;
  passportNumber: string;
  passportExpiry: Date | null;
  rg: string;
  dietary: string;
  medicalNotes: string;
  emergencyName: string;
  emergencyPhone: string;
  isMember: boolean;
  memberType: string;
  passwordHash: string | null;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
};

export type PersonInput = {
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  birthDate?: Date | null;
  jobTitle?: string;
  city?: string;
  state?: string;
  passportNumber?: string;
  passportExpiry?: Date | null;
  rg?: string;
  dietary?: string;
  medicalNotes?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  isMember?: boolean;
  memberType?: string;
  passwordHash?: string | null;
  mustChangePassword?: boolean;
  lastLoginAt?: Date | null;
};

export type NormalizeIssue =
  | { field: "email"; raw: string }
  | { field: "phone"; raw: string }
  | { field: "emergencyPhone"; raw: string }
  | { field: "cpf"; raw: string }
  | { field: "name"; raw: string };

export type NormalizedPerson = { fields: PersonFields; issues: NormalizeIssue[] };

/** Hash bcrypt reconhecível ($2a$, $2b$, $2y$). Qualquer outra coisa não vira senha. */
export function isBcryptHash(value: string | null | undefined): boolean {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(value ?? ""));
}

export function normalizePerson(input: PersonInput): NormalizedPerson {
  const issues: NormalizeIssue[] = [];
  const name = cleanText(input.name);
  const { firstName, lastName } = splitFullName(name);
  if (!firstName) issues.push({ field: "name", raw: input.name });

  const rawEmail = cleanText(input.email);
  const email = normalizeEmail(rawEmail);
  if (rawEmail && !email) issues.push({ field: "email", raw: rawEmail });

  const rawPhone = cleanText(input.phone);
  const phone = rawPhone ? (normalizePhone(rawPhone)?.e164 ?? "") : "";
  if (rawPhone && !phone) issues.push({ field: "phone", raw: rawPhone });

  const rawEmergency = cleanText(input.emergencyPhone);
  const emergencyPhone = rawEmergency ? (normalizePhone(rawEmergency)?.e164 ?? rawEmergency) : "";
  if (rawEmergency && !normalizePhone(rawEmergency))
    issues.push({ field: "emergencyPhone", raw: rawEmergency });

  const rawCpf = cleanText(input.cpf);
  const cpf = normalizeCpf(rawCpf);
  if (rawCpf && !isValidCpf(cpf)) issues.push({ field: "cpf", raw: rawCpf });

  const hash = input.passwordHash ?? null;
  return {
    issues,
    fields: {
      firstName: firstName || "Sem nome",
      lastName,
      badgeName: firstName ? defaultBadgeName(firstName, lastName) : "",
      email: email,
      emailNorm: email,
      phone,
      cpf,
      birthDate: input.birthDate ?? null,
      jobTitle: cleanText(input.jobTitle),
      city: cleanText(input.city),
      state: cleanText(input.state).toUpperCase().slice(0, 2),
      passportNumber: cleanText(input.passportNumber).toUpperCase(),
      passportExpiry: input.passportExpiry ?? null,
      rg: cleanText(input.rg),
      dietary: cleanText(input.dietary),
      medicalNotes: String(input.medicalNotes ?? "").trim(),
      emergencyName: cleanText(input.emergencyName),
      emergencyPhone,
      isMember: input.isMember ?? false,
      memberType: cleanText(input.memberType),
      passwordHash: isBcryptHash(hash) ? hash : null,
      mustChangePassword: input.mustChangePassword ?? true,
      lastLoginAt: input.lastLoginAt ?? null,
    },
  };
}

const isBlank = (v: unknown) => v === null || v === undefined || v === "";

/**
 * Funde a segunda fonte na primeira: o que a primeira já tem prevalece; a
 * segunda só preenche lacunas. Ser associado e a senha do associado sempre
 * prevalecem (a conta permanente é a referência de acesso).
 */
export function mergePerson(base: PersonFields, extra: PersonFields): PersonFields {
  const out: PersonFields = { ...base };
  for (const k of Object.keys(extra) as (keyof PersonFields)[]) {
    if (k === "isMember" || k === "passwordHash" || k === "mustChangePassword") continue;
    if (k === "firstName" || k === "lastName" || k === "badgeName") continue;
    if (isBlank(out[k]) && !isBlank(extra[k])) (out as Record<string, unknown>)[k] = extra[k];
  }
  if (base.firstName === "Sem nome" && extra.firstName !== "Sem nome") {
    out.firstName = extra.firstName;
    out.lastName = extra.lastName;
    out.badgeName = extra.badgeName;
  }
  if (extra.isMember && !base.isMember) {
    out.isMember = true;
    out.memberType = extra.memberType || base.memberType;
  }
  if (!out.passwordHash && extra.passwordHash) {
    out.passwordHash = extra.passwordHash;
    out.mustChangePassword = extra.mustChangePassword;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deduplicação
// ---------------------------------------------------------------------------

export type ExistingPerson = {
  id: string;
  cpf: string;
  email: string;
  phone: string;
  legacyKeys: readonly string[];
};

export type PersonCandidate = {
  /** Chave de origem: "abiec:Passenger:<id>" */
  key: string;
  fields: PersonFields;
};

export type PlannedPerson = {
  id: string;
  /** true = já existia no banco de destino (de migração anterior ou cadastro novo) */
  existing: boolean;
  keys: string[];
  fields: PersonFields;
};

export type PersonMerge = {
  key: string;
  intoId: string;
  reason: "LEGACY_KEY" | "CPF" | "EMAIL" | "PHONE";
};

export type PersonPlan = {
  people: PlannedPerson[];
  byKey: Map<string, string>;
  merges: PersonMerge[];
};

/**
 * Decide qual Person cada registro antigo vira. Ordem de busca:
 *   1. chave de origem já gravada (reexecução: mantém o vínculo mesmo se o
 *      e-mail mudou no legado);
 *   2. CPF → e-mail → telefone contra o banco de destino e contra o que já foi
 *      planejado nesta execução.
 * Sem correspondência, cria uma Person nova com o id dado por `newId`.
 */
export function planPeople(
  candidates: readonly PersonCandidate[],
  existing: readonly ExistingPerson[],
  newId: (key: string) => string,
): PersonPlan {
  const byKey = new Map<string, string>();
  const merges: PersonMerge[] = [];
  const planned = new Map<string, PlannedPerson>();
  const keyOwner = new Map<string, string>();
  for (const e of existing) for (const k of e.legacyKeys) keyOwner.set(k, e.id);

  // Pool de comparação: pessoas do banco + pessoas planejadas
  const pool: { id: string; cpf: string; email: string; phone: string }[] = existing.map((e) => ({
    id: e.id,
    cpf: e.cpf,
    email: e.email,
    phone: e.phone,
  }));
  const existingIds = new Set(existing.map((e) => e.id));

  const attach = (id: string, c: PersonCandidate, reason: PersonMerge["reason"] | null) => {
    const current = planned.get(id);
    if (current) {
      current.fields = mergePerson(current.fields, c.fields);
      current.keys.push(c.key);
      if (reason) merges.push({ key: c.key, intoId: id, reason });
    } else {
      planned.set(id, {
        id,
        existing: existingIds.has(id),
        keys: [c.key],
        fields: c.fields,
      });
      if (reason && existingIds.has(id) && reason !== "LEGACY_KEY")
        merges.push({ key: c.key, intoId: id, reason });
    }
    const p = planned.get(id)!;
    const slot = pool.find((x) => x.id === id);
    if (slot) {
      slot.cpf ||= p.fields.cpf;
      slot.email ||= p.fields.email;
      slot.phone ||= p.fields.phone;
    } else {
      pool.push({ id, cpf: p.fields.cpf, email: p.fields.email, phone: p.fields.phone });
    }
    byKey.set(c.key, id);
  };

  for (const c of candidates) {
    const owner = keyOwner.get(c.key);
    if (owner) {
      attach(owner, c, planned.has(owner) ? "LEGACY_KEY" : null);
      continue;
    }
    const hit = findDuplicate(c.fields, pool);
    if (hit) {
      attach(hit.person.id, c, hit.reason);
      continue;
    }
    attach(newId(c.key), c, null);
  }
  return { people: [...planned.values()], byKey, merges };
}
