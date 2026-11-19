import { z } from "zod";

/** Conteúdo de um modelo — também é o snapshot congelado numa campanha. */
export const templateContentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Dê um nome para a mensagem (ex.: "Lembrete 7 dias antes").')
    .max(120),
  emailSubject: z
    .string()
    .trim()
    .max(200, "O assunto pode ter no máximo 200 caracteres.")
    .default(""),
  emailBody: z.string().max(20_000, "O texto do e-mail está muito longo.").default(""),
  whatsappBody: z
    .string()
    .max(4_000, "A mensagem de WhatsApp pode ter no máximo 4.000 caracteres.")
    .default(""),
  includeActions: z.boolean().default(true),
});

export type TemplateContent = z.output<typeof templateContentSchema>;

/** Validação por canal: o e-mail precisa de assunto e corpo; o WhatsApp de algum texto. */
export function validateForChannel(
  t: TemplateContent,
  channel: "EMAIL" | "WHATSAPP",
): string | null {
  if (channel === "EMAIL") {
    if (!t.emailSubject.trim()) return "Informe o assunto do e-mail.";
    if (!t.emailBody.trim()) return "Escreva o texto do e-mail.";
    return null;
  }
  if (!t.whatsappBody.trim() && !t.emailBody.trim())
    return "Escreva o texto da mensagem de WhatsApp.";
  return null;
}
