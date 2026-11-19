/**
 * Projetos de DEMONSTRAÇÃO da ABIEC — para testar as telas da Onda 2 com dados:
 *
 *   - "Incentivo Lisboa 2027" (viagem de grupo): voos, hotel e rooming, roteiro,
 *     checklist, mural e suporte; portal do viajante com link pessoal.
 *   - "Jantar Anual ABIEC 2026" (evento com convites): empresas com cota, convites
 *     em vários status, mapa de mesas e portal da empresa.
 *
 * Idempotente: apaga e recria os dois projetos (pelo slug) a cada execução.
 * Pessoas são reaproveitadas pelo e-mail. Tudo usa o domínio reservado ".test".
 */
import { randomInt } from "node:crypto";
import type { Prisma, PrismaClient, RegistrationStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Utilitários (cópias locais das regras de @mais/core — o pacote db não depende do core)
// ---------------------------------------------------------------------------

const TOKEN_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const token = () =>
  Array.from({ length: 22 }, () => TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)]).join("");

function shortCodes() {
  const taken = new Set<string>();
  return () => {
    for (;;) {
      const c = String(randomInt(1_000_000)).padStart(6, "0");
      if (!taken.has(c)) {
        taken.add(c);
        return c;
      }
    }
  };
}

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Data em UTC a partir de uma hora local com deslocamento fixo ("-03:00", "+00:00"). */
const at = (local: string, offset: string) => new Date(`${local}:00${offset}`);
const SP = "-03:00";
const LIS = "+00:00"; // março, antes do horário de verão de Portugal

const FORM_DEFAULTS = {
  open: true,
  welcome: "",
  askCpf: true,
  requireCpf: false,
  askCompany: true,
  askJobTitle: true,
  askCity: false,
  defaultCategoryId: null,
  askContactSharing: false,
  successMessage: "",
};

type DemoPerson = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  company: string;
  city?: string;
  passportNumber?: string;
  passportExpiry?: string;
  dietary?: string;
};

async function upsertPerson(
  prisma: PrismaClient,
  tenantId: string,
  orgIds: Map<string, string>,
  p: DemoPerson,
) {
  const emailNorm = p.email.toLowerCase();
  const data = {
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    emailNorm,
    phone: p.phone,
    jobTitle: p.jobTitle,
    city: p.city ?? "São Paulo",
    state: "SP",
    passportNumber: p.passportNumber ?? "",
    passportExpiry: p.passportExpiry ? new Date(`${p.passportExpiry}T00:00:00Z`) : null,
    dietary: p.dietary ?? "",
    isMember: true,
    memberType: "ASSOCIADO",
    searchText: fold(
      [p.firstName, p.lastName, p.email, p.jobTitle, p.city ?? "São Paulo", p.company].join(" "),
    ),
  };
  const existing = await prisma.person.findFirst({ where: { tenantId, emailNorm } });
  const person = existing
    ? await prisma.person.update({ where: { id: existing.id }, data })
    : await prisma.person.create({ data: { tenantId, ...data } });

  let orgId = orgIds.get(p.company);
  if (!orgId) {
    const org =
      (await prisma.organization.findFirst({ where: { tenantId, name: p.company } })) ??
      (await prisma.organization.create({
        data: { tenantId, name: p.company, kind: "Frigorífico", city: "São Paulo", state: "SP" },
      }));
    orgId = org.id;
    orgIds.set(p.company, orgId);
  }
  await prisma.personOrganization.upsert({
    where: { personId_organizationId: { personId: person.id, organizationId: orgId } },
    create: { personId: person.id, organizationId: orgId, role: p.jobTitle },
    update: { role: p.jobTitle },
  });
  return person;
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

const COMPANIES = [
  "Frigorífico Aurora do Cerrado",
  "Carnes Vale Verde",
  "Pampa Alimentos",
  "Grupo Serra Azul",
] as const;

const TRAVELERS: (DemoPerson & { group: "Diretoria" | "Associados" })[] = [
  {
    firstName: "Helena",
    lastName: "Moraes",
    email: "helena.moraes@demo.test",
    phone: "5511990010001",
    jobTitle: "Presidente",
    company: COMPANIES[0],
    passportNumber: "FZ123401",
    passportExpiry: "2031-05-20",
    group: "Diretoria",
  },
  {
    firstName: "Ricardo",
    lastName: "Antunes",
    email: "ricardo.antunes@demo.test",
    phone: "5511990010002",
    jobTitle: "Diretor de Exportação",
    company: COMPANIES[0],
    passportNumber: "FZ123402",
    passportExpiry: "2029-11-02",
    group: "Diretoria",
  },
  {
    firstName: "Camila",
    lastName: "Teixeira",
    email: "camila.teixeira@demo.test",
    phone: "5511990010003",
    jobTitle: "Diretora Comercial",
    company: COMPANIES[1],
    passportNumber: "GA554310",
    passportExpiry: "2030-02-14",
    dietary: "Vegetariana",
    group: "Diretoria",
  },
  {
    firstName: "Eduardo",
    lastName: "Sampaio",
    email: "eduardo.sampaio@demo.test",
    phone: "5511990010004",
    jobTitle: "Gerente de Mercado Externo",
    company: COMPANIES[1],
    passportNumber: "GA554311",
    // Vence menos de 6 meses depois da volta: aparece como pendência
    passportExpiry: "2027-06-30",
    group: "Associados",
  },
  {
    firstName: "Juliana",
    lastName: "Prado",
    email: "juliana.prado@demo.test",
    phone: "5551990010005",
    jobTitle: "Gerente de Qualidade",
    company: COMPANIES[2],
    city: "Porto Alegre",
    passportNumber: "FX908812",
    passportExpiry: "2032-08-09",
    group: "Associados",
  },
  {
    firstName: "Marcelo",
    lastName: "Quintana",
    email: "marcelo.quintana@demo.test",
    phone: "5551990010006",
    jobTitle: "Diretor Industrial",
    company: COMPANIES[2],
    city: "Porto Alegre",
    passportNumber: "FX908813",
    passportExpiry: "2030-12-01",
    group: "Associados",
  },
  {
    firstName: "Beatriz",
    lastName: "Lacerda",
    email: "beatriz.lacerda@demo.test",
    phone: "5562990010007",
    jobTitle: "Coordenadora de Logística",
    company: COMPANIES[3],
    city: "Goiânia",
    passportNumber: "GB110022",
    passportExpiry: "2028-04-18",
    group: "Associados",
  },
  {
    firstName: "Fábio",
    lastName: "Nogueira",
    email: "fabio.nogueira@demo.test",
    phone: "5562990010008",
    jobTitle: "Gerente Comercial",
    company: COMPANIES[3],
    city: "Goiânia",
    // Sem passaporte cadastrado: aparece como documento pendente
    dietary: "Sem glúten",
    group: "Associados",
  },
];

const GUESTS: (DemoPerson & { companyIndex: number; status: RegistrationStatus })[] = [
  // Responsáveis já estão em TRAVELERS (Helena, Camila, Juliana, Beatriz); aqui os convidados
  {
    firstName: "André",
    lastName: "Bastos",
    email: "andre.bastos@demo.test",
    phone: "5511990020001",
    jobTitle: "Gerente Financeiro",
    company: COMPANIES[0],
    companyIndex: 0,
    status: "CONFIRMED",
  },
  {
    firstName: "Luíza",
    lastName: "Falcão",
    email: "luiza.falcao@demo.test",
    phone: "5511990020002",
    jobTitle: "Analista de Exportação",
    company: COMPANIES[0],
    companyIndex: 0,
    status: "INVITED",
  },
  {
    firstName: "Rafael",
    lastName: "Couto",
    email: "rafael.couto@demo.test",
    phone: "5511990020003",
    jobTitle: "Diretor Jurídico",
    company: COMPANIES[1],
    companyIndex: 1,
    status: "CONFIRMED",
  },
  {
    firstName: "Patrícia",
    lastName: "Mendes",
    email: "patricia.mendes@demo.test",
    phone: "5511990020004",
    jobTitle: "Gerente de Marketing",
    company: COMPANIES[1],
    companyIndex: 1,
    status: "DECLINED",
  },
  {
    firstName: "Gustavo",
    lastName: "Reis",
    email: "gustavo.reis@demo.test",
    phone: "5551990020005",
    jobTitle: "Gerente de Compras",
    company: COMPANIES[2],
    companyIndex: 2,
    status: "CONFIRMED",
  },
  {
    firstName: "Sílvia",
    lastName: "Arantes",
    email: "silvia.arantes@demo.test",
    phone: "5562990020006",
    jobTitle: "Diretora de RH",
    company: COMPANIES[3],
    companyIndex: 3,
    status: "INVITED",
  },
];

// Convites individuais (pool da organização)
const INDIVIDUAL: (DemoPerson & { status: RegistrationStatus })[] = [
  {
    firstName: "Otávio",
    lastName: "Lins",
    email: "otavio.lins@demo.test",
    phone: "5561990030001",
    jobTitle: "Secretário-Executivo",
    company: "Ministério da Agricultura (demo)",
    city: "Brasília",
    status: "CONFIRMED",
  },
  {
    firstName: "Renata",
    lastName: "Vilela",
    email: "renata.vilela@demo.test",
    phone: "5511990030002",
    jobTitle: "Jornalista",
    company: "Revista do Agro (demo)",
    status: "INVITED",
  },
];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export async function seedDemoProjects(prisma: PrismaClient, passwordHash: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "abiec" } });
  if (!tenant) throw new Error("Cliente abiec não existe — rode o seed principal.");
  const tenantId = tenant.id;

  await prisma.project.deleteMany({
    where: { tenantId, slug: { in: ["incentivo-lisboa-2027", "jantar-anual-2026"] } },
  });

  const orgIds = new Map<string, string>();
  const people = new Map<string, string>(); // e-mail → personId
  for (const p of [...TRAVELERS, ...GUESTS, ...INDIVIDUAL])
    people.set(p.email, (await upsertPerson(prisma, tenantId, orgIds, p)).id);
  const pid = (email: string) => {
    const id = people.get(email);
    if (!id) throw new Error(`Pessoa ${email} não criada.`);
    return id;
  };

  const trip = await seedTrip(prisma, tenantId, pid);
  const gala = await seedGala(prisma, tenantId, pid, orgIds, passwordHash);
  return { trip, gala };
}

async function seedTrip(prisma: PrismaClient, tenantId: string, pid: (email: string) => string) {
  const nextCode = shortCodes();
  const project = await prisma.project.create({
    data: {
      tenantId,
      type: "INCENTIVE_TRIP",
      status: "REGISTRATION_OPEN",
      name: "Incentivo Lisboa 2027",
      slug: "incentivo-lisboa-2027",
      code: "OS-2027-014",
      description:
        "Viagem de incentivo dos associados: missão comercial em Lisboa e visita técnica ao Alentejo.",
      startsAt: at("2027-03-10T23:55", SP),
      endsAt: at("2027-03-15T17:45", SP),
      timezone: "Europe/Lisbon",
      destination: "Lisboa, Portugal",
      settings: {
        form: FORM_DEFAULTS,
        travel: {
          requiredDocuments: ["PASSPORT", "INSURANCE"],
          travelerUploads: true,
          emergencyContact:
            "Plantão Mais Corporativo 24 h: +55 11 4000-0000 (WhatsApp) · Guia local: +351 910 000 000",
        },
      } satisfies Prisma.InputJsonValue,
      features: {
        create: (
          [
            "REGISTRATION_FORM",
            "FLIGHTS",
            "ACCOMMODATION",
            "ITINERARY",
            "CHECKLIST",
            "MURAL",
            "SUPPORT",
            "DOCUMENTS",
            "VOUCHERS",
          ] as const
        ).map((feature) => ({ feature })),
      },
    },
  });
  const projectId = project.id;

  const groups = new Map<string, string>();
  for (const [name, color] of [
    ["Diretoria", "#123f6d"],
    ["Associados", "#6ba63d"],
  ] as const) {
    const g = await prisma.projectGroup.create({ data: { tenantId, projectId, name, color } });
    groups.set(name, g.id);
  }

  const regs: { id: string; email: string; name: string; token: string }[] = [];
  for (const t of TRAVELERS) {
    const r = await prisma.registration.create({
      data: {
        tenantId,
        projectId,
        personId: pid(t.email),
        role: "TRAVELER",
        status: "CONFIRMED",
        source: "MANUAL",
        groupId: groups.get(t.group) ?? null,
        displayCompany: t.company,
        displayJobTitle: t.jobTitle,
        token: token(),
        shortCode: nextCode(),
        confirmedAt: new Date("2026-10-20T15:00:00Z"),
      },
    });
    regs.push({ id: r.id, email: t.email, name: `${t.firstName} ${t.lastName}`, token: r.token });
  }
  const reg = (i: number) => {
    const r = regs[i];
    if (!r) throw new Error(`Viajante ${i} não existe.`);
    return r.id;
  };

  // Voos: ida e volta, dois localizadores (diretoria e associados)
  const outbound = await prisma.flight.create({
    data: {
      tenantId,
      projectId,
      scope: "INTERNATIONAL",
      airlineCode: "TP",
      airlineName: "TAP Air Portugal",
      flightNumber: "TP82",
      originIata: "GRU",
      originName: "São Paulo/Guarulhos",
      destIata: "LIS",
      destName: "Lisboa Humberto Delgado",
      departureAt: at("2027-03-10T23:55", SP),
      arrivalAt: at("2027-03-11T13:50", LIS),
      notes: "Apresentação no balcão TAP, terminal 3, às 20h50.",
    },
  });
  const inbound = await prisma.flight.create({
    data: {
      tenantId,
      projectId,
      scope: "INTERNATIONAL",
      airlineCode: "TP",
      airlineName: "TAP Air Portugal",
      flightNumber: "TP81",
      originIata: "LIS",
      originName: "Lisboa Humberto Delgado",
      destIata: "GRU",
      destName: "São Paulo/Guarulhos",
      departureAt: at("2027-03-15T10:30", LIS),
      arrivalAt: at("2027-03-15T17:45", SP),
    },
  });
  for (const [flight, rowBase] of [
    [outbound, 12],
    [inbound, 14],
  ] as const) {
    const dir = await prisma.flightLocator.create({
      data: {
        flightId: flight.id,
        code: flight === outbound ? "QX7K2M" : "QX7K2N",
        notes: "Bloco diretoria",
      },
    });
    const assoc = await prisma.flightLocator.create({
      data: {
        flightId: flight.id,
        code: flight === outbound ? "LP4R8T" : "LP4R8U",
        notes: "Bloco associados",
      },
    });
    for (let i = 0; i < TRAVELERS.length; i++) {
      const t = TRAVELERS[i];
      if (!t) continue;
      await prisma.flightPassenger.create({
        data: {
          flightId: flight.id,
          registrationId: reg(i),
          locatorId: t.group === "Diretoria" ? dir.id : assoc.id,
          seat: `${rowBase + Math.floor(i / 2)}${i % 2 === 0 ? "A" : "C"}`,
          ticketNumber: `047${String(2_100_000_000 + i * 7 + (flight === outbound ? 0 : 1))}`,
        },
      });
    }
  }

  // Hotel e rooming: diretoria em single, associados em twin
  const hotel = await prisma.accommodation.create({
    data: {
      tenantId,
      projectId,
      name: "Hotel Avenida Tejo (demo)",
      address: "Avenida da Liberdade, 100",
      city: "Lisboa",
      country: "PT",
      phone: "+351 210 000 000",
      checkIn: at("2027-03-11T15:00", LIS),
      checkOut: at("2027-03-15T07:00", LIS),
      notes: "Café da manhã incluso. Early check-in solicitado para o grupo.",
    },
  });
  const rooming: { type: "SINGLE" | "TWIN"; number: string; label: string; who: number[] }[] = [
    { type: "SINGLE", number: "801", label: "Suíte vista rio", who: [0] },
    { type: "SINGLE", number: "802", label: "Executivo", who: [1] },
    { type: "SINGLE", number: "803", label: "Executivo", who: [2] },
    { type: "TWIN", number: "512", label: "Superior twin", who: [3, 5] },
    { type: "TWIN", number: "", label: "Superior twin", who: [4, 6] },
  ];
  for (const room of rooming) {
    const r = await prisma.room.create({
      data: {
        accommodationId: hotel.id,
        number: room.number,
        type: room.type,
        typeLabel: room.label,
        confirmation: room.number ? `AVT-${room.number}` : "",
      },
    });
    for (const i of room.who)
      await prisma.roomOccupant.create({ data: { roomId: r.id, registrationId: reg(i) } });
  }
  // Fábio (índice 7) fica sem quarto: aparece como pendência de rooming

  // Roteiro (horários no fuso do projeto, Lisboa)
  const day = (d: string) => new Date(`${d}T00:00:00Z`);
  const itinerary: Prisma.ItineraryItemCreateManyInput[] = [
    {
      tenantId,
      projectId,
      date: day("2027-03-10"),
      startTime: "20:50",
      timezone: "America/Sao_Paulo",
      title: "Apresentação no aeroporto de Guarulhos",
      location: "Terminal 3, balcão TAP",
      responsible: "Guia Mais Corporativo",
      sortOrder: 1,
    },
    {
      tenantId,
      projectId,
      date: day("2027-03-11"),
      startTime: "14:30",
      endTime: "15:30",
      title: "Traslado ao hotel",
      location: "Saída do desembarque internacional",
      sortOrder: 2,
    },
    {
      tenantId,
      projectId,
      date: day("2027-03-11"),
      startTime: "20:00",
      title: "Jantar de boas-vindas",
      location: "Restaurante do hotel",
      notes: "Traje esporte fino.",
      sortOrder: 3,
    },
    {
      tenantId,
      projectId,
      date: day("2027-03-12"),
      startTime: "09:00",
      endTime: "12:30",
      title: "Reunião com importadores portugueses",
      location: "Câmara de Comércio Luso-Brasileira (demo)",
      audience: "GROUP",
      audienceId: groups.get("Diretoria") ?? null,
      sortOrder: 4,
    },
    {
      tenantId,
      projectId,
      date: day("2027-03-12"),
      startTime: "10:00",
      endTime: "13:00",
      title: "City tour: Belém e Alfama",
      location: "Saída do lobby",
      audience: "GROUP",
      audienceId: groups.get("Associados") ?? null,
      sortOrder: 5,
    },
    {
      tenantId,
      projectId,
      date: day("2027-03-13"),
      startTime: "07:30",
      endTime: "19:00",
      title: "Visita técnica a uma fazenda no Alentejo",
      location: "Évora",
      notes: "Levar calçado fechado. Almoço incluso.",
      sortOrder: 6,
    },
    {
      tenantId,
      projectId,
      date: day("2027-03-14"),
      startTime: "",
      title: "Dia livre",
      sortOrder: 7,
    },
    {
      tenantId,
      projectId,
      date: day("2027-03-15"),
      startTime: "07:00",
      title: "Saída para o aeroporto",
      location: "Lobby do hotel",
      sortOrder: 8,
    },
  ];
  await prisma.itineraryItem.createMany({ data: itinerary });

  // Checklist: mistura de concluído, em andamento e atrasado (hoje é após 19/11/2026)
  const checklist: Prisma.ChecklistItemCreateManyInput[] = [
    {
      tenantId,
      projectId,
      subject: "Bloqueio aéreo confirmado com a TAP",
      category: "Aéreo",
      responsible: "Otávio Operador",
      dueDate: day("2026-10-15"),
      status: "DONE",
      sortOrder: 1,
    },
    {
      tenantId,
      projectId,
      subject: "Emissão dos bilhetes",
      category: "Aéreo",
      responsible: "Otávio Operador",
      dueDate: day("2027-01-20"),
      status: "IN_PROGRESS",
      sortOrder: 2,
    },
    {
      tenantId,
      projectId,
      subject: "Rooming list enviada ao hotel",
      category: "Hospedagem",
      responsible: "Oscar Operador ABIEC",
      dueDate: day("2026-11-10"),
      status: "PENDING",
      notes: "Falta definir o quarto do Fábio Nogueira.",
      sortOrder: 3,
    },
    {
      tenantId,
      projectId,
      subject: "Seguro viagem de todos os viajantes",
      category: "Documentos",
      responsible: "Gustavo Gestor ABIEC",
      dueDate: day("2027-02-01"),
      status: "PENDING",
      sortOrder: 4,
    },
    {
      tenantId,
      projectId,
      subject: "Contratar ônibus para o Alentejo",
      category: "Receptivo",
      responsible: "Guia local",
      dueDate: day("2026-12-15"),
      status: "IN_PROGRESS",
      sortOrder: 5,
    },
    {
      tenantId,
      projectId,
      subject: "Kit de boas-vindas no quarto",
      category: "Experiência",
      responsible: "Ana Admin ABIEC",
      dueDate: day("2027-03-05"),
      status: "PENDING",
      sortOrder: 6,
    },
  ];
  await prisma.checklistItem.createMany({ data: checklist });

  // Mural
  await prisma.muralPost.createMany({
    data: [
      {
        tenantId,
        projectId,
        title: "Passaporte com validade mínima de 6 meses",
        message:
          "Portugal exige passaporte válido por pelo menos 6 meses após a volta. Confira o seu e envie uma foto pela aba Documentos.",
        urgent: true,
        pinned: true,
        author: "Equipe Mais Corporativo",
        publishAt: new Date("2026-11-01T12:00:00Z"),
      },
      {
        tenantId,
        projectId,
        title: "Bagagem",
        message:
          "Cada viajante tem direito a uma mala de 23 kg despachada e uma bagagem de mão de 8 kg.",
        author: "Equipe Mais Corporativo",
        publishAt: new Date("2026-11-05T12:00:00Z"),
      },
      {
        tenantId,
        projectId,
        title: "Pauta da reunião com importadores",
        message:
          "A pauta e a lista de empresas participantes serão enviadas na semana anterior à viagem.",
        audience: "GROUP",
        audienceId: groups.get("Diretoria") ?? null,
        author: "Ana Admin ABIEC",
        publishAt: new Date("2026-11-10T12:00:00Z"),
      },
    ],
  });

  // Suporte: um chamado novo e um respondido
  await prisma.supportTicket.create({
    data: {
      tenantId,
      projectId,
      registrationId: reg(7),
      subject: "Ainda não tenho passaporte",
      status: "NEW",
      messages: {
        create: {
          authorType: "PERSON",
          authorName: "Fábio Nogueira",
          body: "Meu passaporte está em emissão na Polícia Federal, com previsão para janeiro. Posso enviar depois?",
        },
      },
    },
  });
  await prisma.supportTicket.create({
    data: {
      tenantId,
      projectId,
      registrationId: reg(2),
      subject: "Refeição vegetariana no voo",
      status: "ANSWERED",
      messages: {
        create: [
          {
            authorType: "PERSON",
            authorName: "Camila Teixeira",
            body: "Consigo refeição vegetariana nos dois voos?",
            createdAt: new Date("2026-11-12T13:00:00Z"),
          },
          {
            authorType: "USER",
            authorName: "Equipe Mais Corporativo",
            body: "Sim, Camila. Já solicitamos à TAP refeição vegetariana (VGML) na ida e na volta.",
            createdAt: new Date("2026-11-12T16:20:00Z"),
          },
        ],
      },
    },
  });

  return { project, travelers: regs };
}

async function seedGala(
  prisma: PrismaClient,
  tenantId: string,
  pid: (email: string) => string,
  orgIds: Map<string, string>,
  passwordHash: string,
) {
  const nextCode = shortCodes();
  const project = await prisma.project.create({
    data: {
      tenantId,
      type: "CORPORATE_EVENT",
      status: "REGISTRATION_OPEN",
      name: "Jantar Anual ABIEC 2026",
      slug: "jantar-anual-2026",
      code: "OS-2026-087",
      description:
        "Jantar de confraternização dos associados, com homenagem aos exportadores do ano.",
      startsAt: at("2026-12-10T20:00", SP),
      endsAt: at("2026-12-11T00:30", SP),
      timezone: "America/Sao_Paulo",
      venueName: "Espaço Jardim Paulista (demo)",
      venueAddress: "Rua das Palmeiras, 500 — São Paulo/SP",
      settings: { form: FORM_DEFAULTS } satisfies Prisma.InputJsonValue,
      features: {
        create: (["REGISTRATION_FORM", "INVITES", "TABLES"] as const).map((feature) => ({
          feature,
        })),
      },
      inviteSettings: {
        create: {
          tenantId,
          eventTime: "20:00",
          dressCode: "Passeio completo",
          inviteDeadline: at("2026-12-01T23:59", SP),
          individualPool: 10,
          defaultQuota: 4,
          autoSendOnCompanyRegistration: false, // demo: nada sai por e-mail sem querer
          nearbyHotels: [
            {
              nome: "Hotel Alameda (demo)",
              endereco: "Alameda Santos, 200",
              telefone: "+55 11 3000-0000",
              distancia: "600 m",
              link: "",
            },
          ],
          amenities: [
            {
              titulo: "Estacionamento",
              descricao: "Manobrista no local, cortesia para convidados.",
            },
            { titulo: "Acessibilidade", descricao: "Entrada e banheiros acessíveis no térreo." },
          ],
        },
      },
    },
  });
  const projectId = project.id;

  const vip = await prisma.registrationCategory.create({
    data: { tenantId, projectId, name: "Autoridade", color: "#123f6d", sortOrder: 1 },
  });
  const associate = await prisma.registrationCategory.create({
    data: { tenantId, projectId, name: "Associado", color: "#6ba63d", sortOrder: 2 },
  });

  // Empresas com cota. Login = slug da empresa; senha = DEMO_PASSWORD.
  const responsibles = [TRAVELERS[0], TRAVELERS[2], TRAVELERS[4], TRAVELERS[6]];
  const logins = ["aurora-do-cerrado", "vale-verde", "pampa-alimentos", "serra-azul"];
  const quotas: string[] = [];
  for (let i = 0; i < COMPANIES.length; i++) {
    const name = COMPANIES[i];
    const resp = responsibles[i];
    const login = logins[i];
    if (!name || !resp || !login) continue;
    const q = await prisma.companyQuota.create({
      data: {
        tenantId,
        projectId,
        organizationId: orgIds.get(name) ?? null,
        companyName: name,
        contactName: `${resp.firstName} ${resp.lastName}`,
        contactRole: resp.jobTitle,
        email: resp.email,
        phone: resp.phone,
        quota: i === 0 ? 5 : 4,
        login,
        passwordHash,
        passwordChangedAt: new Date(), // demo: entra direto, sem troca de senha
      },
    });
    quotas.push(q.id);
  }

  type Invite = {
    email: string;
    name: string;
    company: string;
    jobTitle: string;
    quotaId: string | null;
    kind: "RESPONSIBLE" | "COMPANY_GUEST" | "INDIVIDUAL";
    status: RegistrationStatus;
    categoryId: string;
  };
  const invites: Invite[] = [];
  responsibles.forEach((r, i) => {
    if (!r) return;
    invites.push({
      email: r.email,
      name: `${r.firstName} ${r.lastName}`,
      company: r.company,
      jobTitle: r.jobTitle,
      quotaId: quotas[i] ?? null,
      kind: "RESPONSIBLE",
      status: "CONFIRMED",
      categoryId: associate.id,
    });
  });
  for (const g of GUESTS)
    invites.push({
      email: g.email,
      name: `${g.firstName} ${g.lastName}`,
      company: g.company,
      jobTitle: g.jobTitle,
      quotaId: quotas[g.companyIndex] ?? null,
      kind: "COMPANY_GUEST",
      status: g.status,
      categoryId: associate.id,
    });
  for (const g of INDIVIDUAL)
    invites.push({
      email: g.email,
      name: `${g.firstName} ${g.lastName}`,
      company: g.company,
      jobTitle: g.jobTitle,
      quotaId: null,
      kind: "INDIVIDUAL",
      status: g.status,
      categoryId: g.jobTitle === "Jornalista" ? associate.id : vip.id,
    });

  const sentAt = new Date("2026-11-05T13:00:00Z");
  const confirmed: string[] = [];
  const created: { id: string; name: string; token: string; status: RegistrationStatus }[] = [];
  for (const inv of invites) {
    const r = await prisma.registration.create({
      data: {
        tenantId,
        projectId,
        personId: pid(inv.email),
        role: "GUEST",
        status: inv.status,
        source: inv.kind === "INDIVIDUAL" ? "MANUAL" : "COMPANY_QUOTA",
        categoryId: inv.categoryId,
        displayCompany: inv.company,
        displayJobTitle: inv.jobTitle,
        token: token(),
        shortCode: nextCode(),
        confirmedAt: inv.status === "CONFIRMED" ? new Date("2026-11-08T18:00:00Z") : null,
        invite: {
          create: {
            tenantId,
            projectId,
            companyQuotaId: inv.quotaId,
            kind: inv.kind,
            sentAt,
          },
        },
      },
    });
    if (inv.status === "CONFIRMED") confirmed.push(r.id);
    created.push({ id: r.id, name: inv.name, token: r.token, status: inv.status });
  }

  // Mapa de mesas: 6 mesas redondas em duas fileiras + mesa de honra retangular
  const tables: string[] = [];
  const honor = await prisma.eventTable.create({
    data: {
      tenantId,
      projectId,
      number: 1,
      name: "Mesa de honra",
      capacity: 10,
      shape: "RECTANGULAR",
      x: 380,
      y: 60,
      reservedFor: "Diretoria e autoridades",
    },
  });
  tables.push(honor.id);
  for (let i = 0; i < 6; i++) {
    const t = await prisma.eventTable.create({
      data: {
        tenantId,
        projectId,
        number: i + 2,
        capacity: 8,
        shape: "ROUND",
        x: 140 + (i % 3) * 240,
        y: 240 + Math.floor(i / 3) * 220,
        reservedFor: COMPANIES[i] ?? "",
      },
    });
    tables.push(t.id);
  }
  // Acomoda os confirmados: os três primeiros na mesa de honra, o resto em ordem
  for (let i = 0; i < confirmed.length; i++) {
    const registrationId = confirmed[i];
    const tableId = i < 3 ? tables[0] : tables[1 + ((i - 3) % 4)];
    if (!registrationId || !tableId) continue;
    await prisma.seatAssignment.create({
      data: { registrationId, tableId, seat: i < 3 ? i + 1 : Math.floor((i - 3) / 4) + 1 },
    });
  }

  return { project, invites: created, logins };
}
