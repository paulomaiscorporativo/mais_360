import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL não definida"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ROOT_DOMAIN: z.string().default("localhost"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET precisa ter pelo menos 32 caracteres"),
  DEFAULT_TIMEZONE: z.string().default("America/Sao_Paulo"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Configuração inválida do ambiente — ${detail}`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
