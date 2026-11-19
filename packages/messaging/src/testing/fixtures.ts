import { randomBytes } from "node:crypto";
import { PrismaClient } from "@mais/db";
import {
  FakeOutbox,
  createFakeEmailProvider,
  createFakeWhatsappProvider,
  type ProviderFactory,
} from "../providers";
import { defaultDeps, type MessagingDeps } from "../processor";
import { sealSecret } from "../secrets";

/** Utilidades dos testes de integração (banco descartável em TEST_DATABASE_URL). */

export function testDb(): PrismaClient {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL não definida.");
  return new PrismaClient({ datasourceUrl: url });
}

export async function resetDb(db: PrismaClient) {
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE "Workspace", "User", "Job", "MessageCampaign", "MessageDelivery", "MessagingChannel", "MessageTemplate", "MessageAutomation" CASCADE`,
  );
}

const rid = () => randomBytes(4).toString("hex");

export type Seed = {
  tenantId: string;
  projectId: string;
  registrationIds: string[];
  phones: string[];
};

/**
 * Cliente com um evento e N inscritos com telefone e e-mail distintos, mais
 * canais de e-mail e WhatsApp próprios (resolvíveis; o envio é feito por fakes).
 */
export async function seedEvent(
  db: PrismaClient,
  n: number,
  opts: { timezone?: string; startsAt?: Date } = {},
): Promise<Seed> {
  const ws = await db.workspace.create({
    data: { slug: `ws-${rid()}`, name: "Mais Corporativo", status: "ACTIVE" },
  });
  const tenant = await db.tenant.create({
    data: {
      workspaceId: ws.id,
      slug: `t-${rid()}`,
      name: "ABIEC",
      branding: { create: { primaryColor: "#123f6d" } },
    },
  });
  const project = await db.project.create({
    data: {
      tenantId: tenant.id,
      type: "CORPORATE_EVENT",
      name: "Jantar ABIEC 2026",
      slug: `p-${rid()}`,
      timezone: opts.timezone ?? "America/Sao_Paulo",
      startsAt: opts.startsAt ?? new Date("2026-11-24T22:30:00Z"),
      venueName: "Casa Bizutt",
      venueAddress: "Rua do Ator, 577 - São Paulo/SP",
    },
  });
  await db.messagingChannel.create({
    data: {
      tenantId: tenant.id,
      kind: "EMAIL",
      name: "E-mail ABIEC",
      fromName: "ABIEC Eventos",
      fromEmail: "eventos@abiec.test",
      smtpHost: "localhost",
      smtpPort: 1025,
    },
  });
  await db.messagingChannel.create({
    data: {
      tenantId: tenant.id,
      kind: "WHATSAPP",
      name: "WhatsApp ABIEC",
      waProvider: "WEBHOOK",
      waNumber: "5511900000000",
      waConfigEnc: sealSecret(JSON.stringify({ url: "https://fake.invalid/send" })),
    },
  });

  const registrationIds: string[] = [];
  const phones: string[] = [];
  for (let i = 0; i < n; i++) {
    const phone = `55119${String(10_000_000 + i).padStart(8, "0")}`;
    const person = await db.person.create({
      data: {
        tenantId: tenant.id,
        firstName: `Pessoa${i}`,
        lastName: "Teste",
        email: `pessoa${i}@teste.com.br`,
        emailNorm: `pessoa${i}@teste.com.br`,
        phone,
      },
    });
    const reg = await db.registration.create({
      data: {
        tenantId: tenant.id,
        projectId: project.id,
        personId: person.id,
        status: "INVITED",
        token: `tok${rid()}${i}`,
        shortCode: String(100_000 + i),
      },
    });
    registrationIds.push(reg.id);
    phones.push(phone);
  }
  return { tenantId: tenant.id, projectId: project.id, registrationIds, phones };
}

export function fakeProviders(outbox: FakeOutbox): ProviderFactory {
  return {
    email: () => createFakeEmailProvider(outbox, "fake:email"),
    whatsapp: () => createFakeWhatsappProvider(outbox, "fake:whatsapp:5511900000000"),
  };
}

export function testDeps(
  outbox: FakeOutbox,
  now: Date,
  overrides: Partial<MessagingDeps> = {},
): MessagingDeps {
  return defaultDeps({
    providers: fakeProviders(outbox),
    now: () => now,
    random: () => 0.5,
    sleep: async () => undefined,
    emailIntervalMs: 0,
    workerId: `test-${rid()}`,
    ...overrides,
  });
}

export { FakeOutbox };

/** 14:00 em Brasília de uma terça — dentro da janela 08:00–20:00. */
export const INSIDE_WINDOW = new Date("2026-11-17T17:00:00Z");
