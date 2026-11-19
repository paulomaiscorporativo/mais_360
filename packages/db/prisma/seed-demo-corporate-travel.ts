/**
 * Viagens corporativas de DEMONSTRAÇÃO da ABIEC (linha direta):
 *
 *   - política geral (econômica, limites por trecho e por noite, 10 dias de
 *     antecedência) e política da diretoria (executiva);
 *   - aprovação "só fora da política" pelo papel APPROVER do cliente;
 *   - dois associados com login na área do associado (/t/abiec/viagens);
 *   - seis solicitações em status variados, com cotações comparáveis, uma fora
 *     da política aguardando aprovação e uma reservada com localizadores.
 *
 * Idempotente: apaga e recria as solicitações dos associados demo, as
 * políticas e o fluxo de aprovação demo (pelo nome). Datas relativas a hoje.
 */
import type { Prisma, PrismaClient, ServiceType } from "@prisma/client";

const DAY = 86_400_000;
/** Data de viagem a N dias de hoje, ao meio-dia UTC (não muda de dia no fuso do Brasil). */
const inDays = (n: number) => {
  const d = new Date(Date.now() + n * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
};
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const POLICY_NAMES = ["Política geral ABIEC", "Diretoria ABIEC"];
const FLOW_NAME = "Aprovação do cliente";

type Line = {
  type: ServiceType;
  title: string;
  description?: string;
  cents: number;
  quantity?: number;
  details?: Prisma.InputJsonValue;
};
type Quote = {
  title: string;
  description?: string;
  validDays?: number;
  inPolicy: boolean | null;
  lines: Line[];
};
type Violation = { code: string; rule: string; expected: string; found: string; message: string };

export async function seedDemoCorporateTravel(prisma: PrismaClient, passwordHash: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "abiec" } });
  if (!tenant) throw new Error("Cliente abiec não existe — rode o seed principal.");
  const tenantId = tenant.id;

  // ── Associados com acesso à área ──────────────────────────────────────────
  const members = [
    {
      firstName: "Carlos",
      lastName: "Associado",
      email: "associado.abiec@demo.test",
      phone: "5511990020001",
      jobTitle: "Gerente de Exportação",
      memberType: "ASSOCIADO",
      company: "Frigorífico Aurora do Cerrado",
    },
    {
      firstName: "Diana",
      lastName: "Diretora",
      email: "diretora.abiec@demo.test",
      phone: "5511990020002",
      jobTitle: "Diretora Comercial",
      memberType: "DIRETOR",
      company: "Carnes Vale Verde",
    },
  ];
  const personIds: string[] = [];
  for (const m of members) {
    const emailNorm = m.email.toLowerCase();
    const data = {
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      emailNorm,
      phone: m.phone,
      jobTitle: m.jobTitle,
      memberType: m.memberType,
      isMember: true,
      passwordHash,
      mustChangePassword: false, // demo: entra direto
      city: "São Paulo",
      state: "SP",
      searchText: fold([m.firstName, m.lastName, m.email, m.company].join(" ")),
    };
    const existing = await prisma.person.findFirst({ where: { tenantId, emailNorm } });
    const person = existing
      ? await prisma.person.update({ where: { id: existing.id }, data })
      : await prisma.person.create({ data: { tenantId, ...data } });
    const org =
      (await prisma.organization.findFirst({ where: { tenantId, name: m.company } })) ??
      (await prisma.organization.create({
        data: { tenantId, name: m.company, kind: "Frigorífico", city: "São Paulo", state: "SP" },
      }));
    await prisma.personOrganization.upsert({
      where: { personId_organizationId: { personId: person.id, organizationId: org.id } },
      create: { personId: person.id, organizationId: org.id, role: m.jobTitle, primary: true },
      update: { role: m.jobTitle, primary: true },
    });
    personIds.push(person.id);
  }
  const [carlosId, dianaId] = personIds as [string, string];

  // ── Política e aprovação ──────────────────────────────────────────────────
  await prisma.travelRequest.deleteMany({
    where: { tenantId, requesterPersonId: { in: personIds } },
  });
  await prisma.travelPolicy.deleteMany({ where: { tenantId, name: { in: POLICY_NAMES } } });
  await prisma.approvalFlow.deleteMany({ where: { tenantId, name: FLOW_NAME } });

  const general = await prisma.travelPolicy.create({
    data: {
      tenantId,
      name: POLICY_NAMES[0]!,
      description: "Vale para todos os associados.",
      priority: 0,
      minAdvanceDays: 10,
      requireInsuranceInternational: true,
      requireJustification: true,
      rules: {
        create: [
          {
            serviceType: "AIR",
            unit: "trecho",
            maxAmountCents: 450_000,
            maxCabin: "ECONOMY",
            currency: "BRL",
          },
          {
            serviceType: "HOTEL",
            unit: "noite",
            maxAmountCents: 120_000,
            maxHotelStars: 4,
            currency: "BRL",
          },
        ],
      },
    },
  });
  const board = await prisma.travelPolicy.create({
    data: {
      tenantId,
      name: POLICY_NAMES[1]!,
      description: "Diretoria pode voar em executiva.",
      priority: 10,
      appliesTo: { memberTypes: ["DIRETOR"], jobTitles: [] },
      minAdvanceDays: 5,
      requireInsuranceInternational: true,
      requireJustification: true,
      rules: {
        create: [
          {
            serviceType: "AIR",
            unit: "trecho",
            maxAmountCents: 2_000_000,
            maxCabin: "BUSINESS",
            currency: "BRL",
          },
          {
            serviceType: "HOTEL",
            unit: "noite",
            maxAmountCents: 250_000,
            maxHotelStars: 5,
            currency: "BRL",
          },
        ],
      },
    },
  });
  const flow = await prisma.approvalFlow.create({
    data: {
      tenantId,
      name: FLOW_NAME,
      conditions: { onlyOutOfPolicy: true, minAmountCents: null, scope: "ANY" },
      steps: {
        create: { sortOrder: 0, name: "Aprovador do cliente", approverType: "TENANT_ROLE" },
      },
    },
    include: { steps: true },
  });
  const step = flow.steps[0]!;

  const operator = await prisma.user.findUnique({ where: { email: "operador.abiec@demo.test" } });
  const approver = await prisma.user.findUnique({ where: { email: "aprovador.abiec@demo.test" } });
  const opName = operator?.name ?? "Oscar Operador ABIEC";

  // ── Protocolos (sequência anual do cliente) ───────────────────────────────
  const year = new Date().getUTCFullYear();
  const latest = await prisma.travelRequest.findFirst({
    where: { tenantId, protocol: { startsWith: `VC-${year}-` } },
    orderBy: { protocol: "desc" },
    select: { protocol: true },
  });
  let seq = latest ? Number(latest.protocol.slice(-6)) : 0;
  const protocol = () => `VC-${year}-${String(++seq).padStart(6, "0")}`;

  const people = {
    [carlosId]: {
      name: "Carlos Associado",
      email: members[0]!.email,
      phone: members[0]!.phone,
      company: members[0]!.company,
    },
    [dianaId]: {
      name: "Diana Diretora",
      email: members[1]!.email,
      phone: members[1]!.phone,
      company: members[1]!.company,
    },
  };

  async function request(o: {
    personId: string;
    policyId: string;
    status: Prisma.TravelRequestCreateInput["status"];
    tripType: "ONE_WAY" | "ROUND_TRIP" | "MULTI_CITY";
    scope: "DOMESTIC" | "INTERNATIONAL";
    segments: { origin: string; destination: string; day: number }[];
    pax?: { name: string; type: "HOLDER" | "COMPANION" | "EMPLOYEE" | "GUEST" }[];
    services: ServiceType[];
    details: Prisma.InputJsonValue;
    purpose: string;
    budgetCents?: number;
    createdHoursAgo: number;
    assigned?: boolean;
    quotes?: Quote[];
    chosen?: number;
    justification?: string;
    violations?: Violation[];
    events: {
      status: Prisma.TravelRequestEventCreateInput["status"];
      note: string;
      actor: "member" | "staff" | "approver";
      hoursAgo: number;
    }[];
  }) {
    const who = people[o.personId]!;
    const segs = o.segments;
    const passengers = o.pax ?? [{ name: who.name, type: "HOLDER" as const }];
    const r = await prisma.travelRequest.create({
      data: {
        tenantId,
        protocol: protocol(),
        requesterPersonId: o.personId,
        requesterName: who.name,
        requesterEmail: who.email,
        requesterPhone: who.phone,
        companyName: who.company,
        policyId: o.policyId,
        kind: o.services.includes("AIR") && o.services.includes("HOTEL") ? "PACKAGE" : "AIR",
        tripType: o.tripType,
        origin: segs[0]!.origin,
        destination:
          o.tripType === "MULTI_CITY" ? segs[segs.length - 1]!.destination : segs[0]!.destination,
        departDate: inDays(segs[0]!.day),
        returnDate: o.tripType === "ONE_WAY" ? null : inDays(segs[segs.length - 1]!.day),
        scope: o.scope,
        pax: passengers.length,
        budgetCents: o.budgetCents ?? null,
        purpose: o.purpose,
        requestedServices: o.services,
        serviceDetails: o.details,
        outOfPolicy: !!o.violations?.length,
        policyViolations: (o.violations ?? []) as Prisma.InputJsonValue,
        justification: o.justification ?? "",
        status: o.status,
        assignedUserId: o.assigned ? (operator?.id ?? null) : null,
        handledBy: o.assigned ? opName : "",
        createdAt: ago(o.createdHoursAgo),
        segments: {
          create: segs.map((s, i) => ({
            sortOrder: i,
            origin: s.origin,
            destination: s.destination,
            date: inDays(s.day),
          })),
        },
        passengers: {
          create: passengers.map((p, i) => ({
            sortOrder: i,
            name: p.name,
            type: p.type,
            personId: p.type === "HOLDER" ? o.personId : null,
            docType: o.scope === "INTERNATIONAL" ? "PASSPORT" : "CPF",
          })),
        },
        events: {
          create: o.events.map((e) => ({
            status: e.status,
            note: e.note,
            actorName:
              e.actor === "member"
                ? who.name
                : e.actor === "approver"
                  ? (approver?.name ?? "Aprovador")
                  : opName,
            actorType: e.actor === "member" ? "PERSON" : "USER",
            createdAt: ago(e.hoursAgo),
          })),
        },
      },
    });
    const quoteIds: string[] = [];
    for (const [i, q] of (o.quotes ?? []).entries()) {
      const total = q.lines.reduce((s, l) => s + l.cents, 0);
      const created = await prisma.travelQuote.create({
        data: {
          requestId: r.id,
          sortOrder: i,
          title: q.title,
          description: q.description ?? "",
          currency: "BRL",
          totalCents: total,
          perPaxCents: Math.round(total / passengers.length),
          validUntil: q.validDays ? inDays(q.validDays) : null,
          inPolicy: q.inPolicy,
          createdBy: opName,
          serviceItems: {
            create: q.lines.map((l) => ({
              tenantId,
              type: l.type,
              status: "QUOTED",
              provider: "MANUAL",
              title: l.title,
              description: l.description ?? "",
              quantity: l.quantity ?? 1,
              currency: "BRL",
              saleCents: l.cents,
              details: l.details ?? {},
              createdBy: opName,
            })),
          },
        },
      });
      quoteIds.push(created.id);
    }
    const chosenId = o.chosen !== undefined ? quoteIds[o.chosen] : undefined;
    if (chosenId)
      await prisma.travelRequest.update({
        where: { id: r.id },
        data: { chosenQuoteId: chosenId, decidedAt: ago(o.events[o.events.length - 1]!.hoursAgo) },
      });
    return { ...r, quoteIds, chosenId };
  }

  const air = (cabin: string) => ({
    cabin,
    checkedBaggage: true,
    seatPreference: "ANY",
    preferredAirline: "",
    loyaltyProgram: "",
  });
  const hotel = (city: string, stars: string) => ({
    city,
    stars,
    rooms: 1,
    roomType: "SINGLE",
    breakfast: true,
    chain: "",
    reference: "",
  });

  // 1. Nova — ninguém assumiu
  await request({
    personId: carlosId,
    policyId: general.id,
    status: "NEW",
    tripType: "ROUND_TRIP",
    scope: "DOMESTIC",
    segments: [
      { origin: "São Paulo (GRU)", destination: "Brasília (BSB)", day: 28 },
      { origin: "Brasília (BSB)", destination: "São Paulo (GRU)", day: 30 },
    ],
    services: ["AIR", "HOTEL"],
    details: { AIR: air("ECONOMY"), HOTEL: hotel("Brasília", "4") },
    purpose: "Reunião no Ministério da Agricultura sobre habilitação de plantas.",
    budgetCents: 350_000,
    createdHoursAgo: 3,
    events: [{ status: "NEW", note: "Solicitação enviada.", actor: "member", hoursAgo: 3 }],
  });

  // 2. Em atendimento — internacional com acompanhante
  await request({
    personId: carlosId,
    policyId: general.id,
    status: "IN_PROGRESS",
    tripType: "ROUND_TRIP",
    scope: "INTERNATIONAL",
    segments: [
      { origin: "São Paulo (GRU)", destination: "Lisboa (LIS)", day: 45 },
      { origin: "Lisboa (LIS)", destination: "São Paulo (GRU)", day: 52 },
    ],
    pax: [
      { name: "Carlos Associado", type: "HOLDER" },
      { name: "Marina Associado", type: "COMPANION" },
    ],
    services: ["AIR", "HOTEL", "TRAVEL_INSURANCE"],
    details: { AIR: air("ECONOMY"), HOTEL: hotel("Lisboa", "4"), TRAVEL_INSURANCE: { notes: "" } },
    purpose: "Visita a importadores portugueses.",
    createdHoursAgo: 30,
    assigned: true,
    events: [
      { status: "NEW", note: "Solicitação enviada.", actor: "member", hoursAgo: 30 },
      {
        status: "IN_PROGRESS",
        note: `${opName} assumiu o atendimento.`,
        actor: "staff",
        hoursAgo: 26,
      },
    ],
  });

  // 3. Cotada — duas opções lado a lado, uma fora da política
  await request({
    personId: carlosId,
    policyId: general.id,
    status: "QUOTED",
    tripType: "ROUND_TRIP",
    scope: "INTERNATIONAL",
    segments: [
      { origin: "São Paulo (GRU)", destination: "Dubai (DXB)", day: 60 },
      { origin: "Dubai (DXB)", destination: "São Paulo (GRU)", day: 66 },
    ],
    services: ["AIR", "HOTEL", "TRAVEL_INSURANCE"],
    details: { AIR: air("ECONOMY"), HOTEL: hotel("Dubai", "4"), TRAVEL_INSURANCE: { notes: "" } },
    purpose: "Gulfood 2027 — estande da ABIEC.",
    budgetCents: 1_800_000,
    createdHoursAgo: 72,
    assigned: true,
    quotes: [
      {
        title: "Emirates direto + hotel no Trade Centre",
        validDays: 5,
        inPolicy: true,
        lines: [
          {
            type: "AIR",
            title: "Emirates EK262/EK261, direto",
            description: "Econômica, 2 × 23 kg",
            cents: 820_000,
            details: { cabin: "ECONOMY" },
          },
          {
            type: "HOTEL",
            title: "Novotel World Trade Centre",
            description: "6 noites, café incluído",
            cents: 540_000,
            quantity: 6,
            details: { stars: 4 },
          },
          { type: "TRAVEL_INSURANCE", title: "Seguro viagem 7 dias", cents: 28_000 },
        ],
      },
      {
        title: "Executiva com conexão + hotel 5 estrelas",
        validDays: 5,
        inPolicy: false,
        lines: [
          {
            type: "AIR",
            title: "Qatar QR774/QR773 via Doha",
            description: "Executiva",
            cents: 2_640_000,
            details: { cabin: "BUSINESS" },
          },
          {
            type: "HOTEL",
            title: "Conrad Dubai",
            description: "6 noites",
            cents: 1_080_000,
            quantity: 6,
            details: { stars: 5 },
          },
          { type: "TRAVEL_INSURANCE", title: "Seguro viagem 7 dias", cents: 28_000 },
        ],
      },
    ],
    events: [
      { status: "NEW", note: "Solicitação enviada.", actor: "member", hoursAgo: 72 },
      {
        status: "IN_PROGRESS",
        note: `${opName} assumiu o atendimento.`,
        actor: "staff",
        hoursAgo: 70,
      },
      { status: "QUOTED", note: "2 opções enviadas ao solicitante.", actor: "staff", hoursAgo: 20 },
    ],
  });

  // 4. Fora da política aguardando aprovação
  const paris = await request({
    personId: carlosId,
    policyId: general.id,
    status: "AWAITING_APPROVAL",
    tripType: "ROUND_TRIP",
    scope: "INTERNATIONAL",
    segments: [
      { origin: "São Paulo (GRU)", destination: "Paris (CDG)", day: 8 },
      { origin: "Paris (CDG)", destination: "São Paulo (GRU)", day: 13 },
    ],
    services: ["AIR", "HOTEL", "TRAVEL_INSURANCE"],
    details: { AIR: air("ECONOMY"), HOTEL: hotel("Paris", "4"), TRAVEL_INSURANCE: { notes: "" } },
    purpose: "SIAL Paris — reuniões com compradores do Oriente Médio.",
    createdHoursAgo: 50,
    assigned: true,
    quotes: [
      {
        title: "Air France direto + hotel em Villepinte",
        validDays: 2,
        inPolicy: false,
        lines: [
          {
            type: "AIR",
            title: "Air France AF457/AF454, direto",
            description: "Econômica",
            cents: 1_190_000,
            details: { cabin: "ECONOMY" },
          },
          {
            type: "HOTEL",
            title: "Novotel Paris Nord Expo Villepinte",
            description: "5 noites",
            cents: 450_000,
            quantity: 5,
            details: { stars: 4 },
          },
          { type: "TRAVEL_INSURANCE", title: "Seguro viagem 6 dias", cents: 24_000 },
        ],
      },
      {
        title: "TAP via Lisboa + hotel em Paris",
        validDays: 2,
        inPolicy: true,
        lines: [
          {
            type: "AIR",
            title: "TAP TP88/TP439 via Lisboa",
            description: "Econômica, 1 conexão",
            cents: 780_000,
            details: { cabin: "ECONOMY" },
          },
          {
            type: "HOTEL",
            title: "Ibis Styles Paris Gare du Nord",
            description: "5 noites",
            cents: 310_000,
            quantity: 5,
            details: { stars: 3 },
          },
          { type: "TRAVEL_INSURANCE", title: "Seguro viagem 6 dias", cents: 24_000 },
        ],
      },
    ],
    chosen: 0,
    justification:
      "O voo direto chega a tempo da abertura da feira; a conexão por Lisboa me faria perder o primeiro dia de reuniões.",
    violations: [
      {
        code: "ADVANCE",
        rule: "Antecedência mínima",
        expected: "10 dias",
        found: "8 dias",
        message:
          "A compra está sendo feita com 8 dias de antecedência; a política pede pelo menos 10.",
      },
      {
        code: "AMOUNT",
        rule: "Limite de aéreo por trecho",
        expected: "Até R$ 4.500,00",
        found: "R$ 5.950,00",
        message: "Aéreo por trecho sai por R$ 5.950,00 por passageiro; o limite é R$ 4.500,00.",
      },
    ],
    events: [
      { status: "NEW", note: "Solicitação enviada.", actor: "member", hoursAgo: 50 },
      {
        status: "IN_PROGRESS",
        note: `${opName} assumiu o atendimento.`,
        actor: "staff",
        hoursAgo: 48,
      },
      { status: "QUOTED", note: "2 opções enviadas ao solicitante.", actor: "staff", hoursAgo: 30 },
      {
        status: "AWAITING_APPROVAL",
        note: "Opção escolhida: Air France direto + hotel em Villepinte (R$ 16.640,00). Fora da política: antecedência mínima, limite de aéreo por trecho. Enviada para aprovação.",
        actor: "member",
        hoursAgo: 4,
      },
    ],
  });
  await prisma.travelApproval.create({
    data: {
      requestId: paris.id,
      stepId: step.id,
      sortOrder: 0,
      stepName: step.name,
      requestedAt: ago(4),
    },
  });

  // 5. Reservada — diretoria, com localizadores
  const booked = await request({
    personId: dianaId,
    policyId: board.id,
    status: "BOOKED",
    tripType: "ROUND_TRIP",
    scope: "DOMESTIC",
    segments: [
      { origin: "São Paulo (CGH)", destination: "Brasília (BSB)", day: 12 },
      { origin: "Brasília (BSB)", destination: "São Paulo (CGH)", day: 13 },
    ],
    services: ["AIR", "HOTEL", "TRANSFER"],
    details: {
      AIR: air("BUSINESS"),
      HOTEL: hotel("Brasília", "5"),
      TRANSFER: { notes: "Aeroporto ↔ hotel ↔ Esplanada" },
    },
    purpose: "Audiência com a Frente Parlamentar da Agropecuária.",
    createdHoursAgo: 120,
    assigned: true,
    quotes: [
      {
        title: "LATAM + Windsor Plaza",
        inPolicy: true,
        lines: [
          {
            type: "AIR",
            title: "LATAM LA3360/LA3365",
            description: "Premium economy",
            cents: 310_000,
            details: { cabin: "PREMIUM_ECONOMY" },
          },
          {
            type: "HOTEL",
            title: "Windsor Plaza Brasília",
            description: "1 noite",
            cents: 98_000,
            quantity: 1,
            details: { stars: 5 },
          },
          { type: "TRANSFER", title: "Transfer executivo (3 trechos)", cents: 45_000 },
        ],
      },
    ],
    chosen: 0,
    events: [
      { status: "NEW", note: "Solicitação enviada.", actor: "member", hoursAgo: 120 },
      {
        status: "IN_PROGRESS",
        note: `${opName} assumiu o atendimento.`,
        actor: "staff",
        hoursAgo: 118,
      },
      { status: "QUOTED", note: "1 opção enviada ao solicitante.", actor: "staff", hoursAgo: 100 },
      {
        status: "APPROVED",
        note: "Opção escolhida: LATAM + Windsor Plaza (R$ 4.530,00). Sem aprovação exigida: segue para a emissão.",
        actor: "member",
        hoursAgo: 96,
      },
      {
        status: "BOOKED",
        note: "Reserva emitida. LATAM LA3360/LA3365 (QWERTY); Windsor Plaza Brasília (WP-88231); Transfer executivo.",
        actor: "staff",
        hoursAgo: 90,
      },
    ],
  });
  for (const b of [
    { type: "AIR" as const, title: "LATAM LA3360/LA3365", locator: "QWERTY" },
    { type: "HOTEL" as const, title: "Windsor Plaza Brasília — 1 noite", locator: "WP-88231" },
    { type: "TRANSFER" as const, title: "Transfer executivo (3 trechos)", locator: "" },
  ])
    await prisma.serviceItem.create({
      data: {
        tenantId,
        travelRequestId: booked.id,
        type: b.type,
        status: "ISSUED",
        provider: "MANUAL",
        title: b.title,
        locator: b.locator,
        startsAt: inDays(12),
        endsAt: inDays(13),
        createdBy: opName,
      },
    });

  // 6. Cancelada pelo associado
  await request({
    personId: carlosId,
    policyId: general.id,
    status: "CANCELED",
    tripType: "ONE_WAY",
    scope: "DOMESTIC",
    segments: [{ origin: "São Paulo (GRU)", destination: "Campo Grande (CGR)", day: 20 }],
    services: ["AIR"],
    details: { AIR: air("ECONOMY") },
    purpose: "Visita técnica a planta associada.",
    createdHoursAgo: 200,
    events: [
      { status: "NEW", note: "Solicitação enviada.", actor: "member", hoursAgo: 200 },
      {
        status: "CANCELED",
        note: "Cancelada pelo solicitante: visita adiada.",
        actor: "member",
        hoursAgo: 190,
      },
    ],
  });

  return {
    logins: members.map((m) => m.email),
    requests: 6,
  };
}
