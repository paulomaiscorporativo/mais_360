import { escapeHtml, type RenderedEmail } from "../messaging/render";
import { accessTokenValidityLabel } from "./tokens";

/**
 * E-mails de sistema da equipe (convite, redefinição de senha, novo acesso).
 * Sóbrios, em português, com a marca da plataforma — ou a do assinante quando
 * ele usa marca própria (white-label). Renderização pura: o worker só envia.
 */

export const AUTH_EMAIL_KINDS = ["INVITE", "PASSWORD_RESET", "ACCESS_GRANTED"] as const;
export type AuthEmailKind = (typeof AUTH_EMAIL_KINDS)[number];

export type AuthEmailInput = {
  kind: AuthEmailKind;
  recipientName: string;
  /** Link de ação (convite, redefinição ou página de entrada). */
  link: string;
  brand: { name: string; color: string; byline?: string };
  /** Onde a pessoa ganhou acesso: "ABIEC", "Mais Corporativo", "Plataforma". */
  contextName?: string;
  /** Quem convidou ou pediu a redefinição (vazio = a própria pessoa). */
  actorName?: string;
  /** Papel legível no contexto: "Administrador", "Operador". */
  roleLabel?: string;
};

const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Olá";
}

type Copy = { subject: string; title: string; paragraphs: string[]; cta: string; note: string };

function copyFor(i: AuthEmailInput): Copy {
  const where = i.contextName ? ` em ${i.contextName}` : "";
  const role = i.roleLabel ? ` como ${i.roleLabel}` : "";
  const by = i.actorName ? `${i.actorName} convidou você` : "Você foi convidado";
  switch (i.kind) {
    case "INVITE":
      return {
        subject: `Seu acesso ao ${i.brand.name}`,
        title: "Defina sua senha para começar",
        paragraphs: [
          `${by} para acessar o ${i.brand.name}${where}${role}.`,
          "Para ativar sua conta, crie uma senha pessoal no link abaixo.",
        ],
        cta: "Definir minha senha",
        note: `O link vale por ${accessTokenValidityLabel("INVITE")} e só pode ser usado uma vez. Se você não esperava este convite, ignore este e-mail.`,
      };
    case "PASSWORD_RESET":
      return {
        subject: `Redefinição de senha — ${i.brand.name}`,
        title: "Redefina sua senha",
        paragraphs: [
          i.actorName
            ? `${i.actorName} pediu a redefinição da sua senha no ${i.brand.name}.`
            : `Recebemos um pedido para redefinir a sua senha no ${i.brand.name}.`,
          "Use o link abaixo para criar uma nova senha. Ao concluir, os outros dispositivos conectados serão desconectados.",
        ],
        cta: "Criar nova senha",
        note: `O link vale por ${accessTokenValidityLabel("PASSWORD_RESET")} e só pode ser usado uma vez. Se não foi você quem pediu, ignore este e-mail: sua senha atual continua valendo.`,
      };
    case "ACCESS_GRANTED":
      return {
        subject: `Novo acesso no ${i.brand.name}${where}`,
        title: "Você recebeu um novo acesso",
        paragraphs: [
          `${i.actorName ? `${i.actorName} liberou` : "Foi liberado"} para você o acesso${where}${role}.`,
          "Entre com o mesmo e-mail e a senha que você já usa.",
        ],
        cta: "Entrar",
        note: "Se você não reconhece este acesso, fale com o administrador.",
      };
  }
}

export function renderAuthEmail(i: AuthEmailInput): RenderedEmail {
  const c = copyFor(i);
  const color = SAFE_COLOR.test(i.brand.color) ? i.brand.color : "#002042";
  const greeting = `Olá, ${firstName(i.recipientName)}.`;
  const brandLine = i.brand.byline ? `${i.brand.name} ${i.brand.byline}` : i.brand.name;

  const text = [
    greeting,
    "",
    ...c.paragraphs.flatMap((p) => [p, ""]),
    `${c.cta}: ${i.link}`,
    "",
    c.note,
    "",
    "—",
    brandLine,
  ].join("\n");

  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1c2e;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e7ee;border-radius:10px;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e2e7ee;">
<span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${color};margin-right:8px;vertical-align:middle;"></span>
<span style="font-size:15px;font-weight:600;vertical-align:middle;">${e(i.brand.name)}</span>
</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;">${e(c.title)}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${e(greeting)}</p>
${c.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#33425a;">${e(p)}</p>`).join("\n")}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:6px;background:${color};">
<a href="${e(i.link)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${e(c.cta)}</a>
</td></tr></table>
<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#5b6a80;">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
<p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${e(i.link)}" style="color:#33425a;">${e(i.link)}</a></p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#5b6a80;">${e(c.note)}</p>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e2e7ee;font-size:12px;color:#7a879a;">${e(brandLine)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject: c.subject, html, text };
}
