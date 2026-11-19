import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@mais/db";
import { AppError } from "./errors";

/**
 * Contrato das Server Actions (CLAUDE.md): nunca lançam para a interface.
 *   { ok: true, data }  |  { ok: false, error, fieldErrors? }
 */
export type ActionResult<T = void> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type FieldErrors = Record<string, string>;

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Envolve a action: valida a entrada com zod, converte erros conhecidos em
 * mensagens claras e deixa passar redirect/notFound do Next.
 */
export function defineAction<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.infer<S>) => Promise<T>,
) {
  return async (raw: unknown): Promise<ActionResult<T>> => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Revise os campos destacados.",
        fieldErrors: zodFieldErrors(parsed.error),
      };
    }
    try {
      return { ok: true, data: await handler(parsed.data) };
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof AppError)
        return { ok: false, error: err.message, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) };
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return { ok: false, error: "Já existe um registro com esses dados." };
      }
      console.error("[action]", err);
      return { ok: false, error: "Algo deu errado do nosso lado. Tente de novo em instantes." };
    }
  };
}

// Validadores reutilizáveis com mensagens em português
export const v = {
  text: (label: string, max = 200) =>
    z.string().trim().min(1, `Informe ${label}.`).max(max, `Use no máximo ${max} caracteres.`),
  optionalText: (max = 500) =>
    z.string().trim().max(max, `Use no máximo ${max} caracteres.`).default(""),
  email: () => z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  slug: () =>
    z
      .string()
      .trim()
      .toLowerCase()
      .min(2, "O endereço precisa ter pelo menos 2 caracteres.")
      .max(40, "Use no máximo 40 caracteres.")
      .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use só letras minúsculas, números e hífen."),
  hex: () =>
    z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB."),
};
