import { buildFieldValues, isKnownField, type MessageContext } from "./fields";

/**
 * Renderização de modelos.
 *
 * Marcação aceita no corpo (a mesma para e-mail e WhatsApp, para o organizador
 * escrever uma vez só):
 *   **negrito**   → <strong> no e-mail, *negrito* no WhatsApp
 *   linha em branco → novo parágrafo
 *   URLs          → links clicáveis
 *   {{campo}}     → valor do campo (desconhecido ou vazio vira "")
 */

export const PLATFORM_NAME = "Comitiva";

const FIELD_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function extractFields(template: string): string[] {
  return [...new Set([...template.matchAll(FIELD_RE)].map((m) => (m[1] ?? "").toLowerCase()))];
}

/** Campos usados no modelo que não existem no catálogo (para avisar no editor). */
export function unknownFields(template: string): string[] {
  return extractFields(template).filter((f) => !isKnownField(f));
}

export function fillFields(template: string, values: Record<string, string>): string {
  return template.replace(FIELD_RE, (_, key: string) => values[key.toLowerCase()] ?? "");
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

/** Só aceita http(s) em atributos href — bloqueia javascript:, data: etc. */
export function safeUrl(url: string | undefined | null): string {
  const u = String(url ?? "").trim();
  return /^https?:\/\//i.test(u) ? u : "";
}

// ---------------------------------------------------------------------------
// Identidade visual no e-mail
// ---------------------------------------------------------------------------

export type EmailBranding = {
  primaryColor: string;
  accentColor?: string;
  logoUrl?: string;
  bannerUrl?: string;
  footer?: string;
  /** "Enviado com Comitiva · Mais Corporativo" — desligado em white-label */
  showPlatformBrand?: boolean;
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Texto legível sobre a cor da marca (branco ou tinta), pelo maior contraste. */
export function textOn(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  const l = luminance(rgb);
  const contrastWhite = 1.05 / (l + 0.05);
  const contrastInk = (l + 0.05) / (luminance([11, 19, 32]) + 0.05);
  return contrastWhite >= contrastInk ? "#ffffff" : "#0b1320";
}

const safeColor = (hex: string | undefined, fallback: string) =>
  hex && hexToRgb(hex) ? `#${hex.replace("#", "")}` : fallback;

// ---------------------------------------------------------------------------
// Corpo
// ---------------------------------------------------------------------------

function inlineHtml(text: string, linkColor: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
      `<a href="$1" style="color:${linkColor};text-decoration:underline;">$1</a>`,
    )
    .replace(/\n/g, "<br>");
}

function paragraphsHtml(text: string, linkColor: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1b2536;">${inlineHtml(p.trim(), linkColor)}</p>`,
    )
    .join("");
}

/** O texto contém exatamente esta URL (não só um prefixo dela)? */
export function containsUrl(text: string, url: string): boolean {
  return text
    .split(/\s+/)
    .map((t) => t.replace(/[.,;:!?)]+$/, ""))
    .includes(url);
}

export function toWhatsappMarkup(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Ações (botões)
// ---------------------------------------------------------------------------

export type MessageAction = { label: string; url: string; kind: "primary" | "secondary" };

/** Botões padrão: confirmar (se ainda faz sentido) e abrir o crachá/convite. */
export function defaultActions(ctx: MessageContext): MessageAction[] {
  const r = ctx.registration;
  if (!r) return [];
  const out: MessageAction[] = [];
  const canConfirm = !r.checkedIn && (r.status === "PENDING" || r.status === "INVITED");
  const confirm = safeUrl(r.confirmUrl);
  const badge = safeUrl(r.badgeUrl);
  if (canConfirm && confirm)
    out.push({ label: "Confirmar minha presença", url: confirm, kind: "primary" });
  if (badge)
    out.push({
      label: "Abrir meu crachá digital",
      url: badge,
      kind: out.length ? "secondary" : "primary",
    });
  return out;
}

function statusNote(ctx: MessageContext): string {
  const r = ctx.registration;
  if (!r) return "";
  if (r.checkedIn) return "Sua presença já foi registrada no evento.";
  if (r.status === "CONFIRMED") return "Sua presença está confirmada. Até lá!";
  return "";
}

// ---------------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------------

export type TemplateContent = {
  emailSubject: string;
  emailBody: string;
  whatsappBody: string;
  includeActions: boolean;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export function renderEmail(
  tpl: Pick<TemplateContent, "emailSubject" | "emailBody" | "includeActions">,
  ctx: MessageContext,
  branding: EmailBranding,
  now: Date = new Date(),
): RenderedEmail {
  const values = buildFieldValues(ctx, now);
  const subject = fillFields(tpl.emailSubject, values).replace(/\s+/g, " ").trim();
  const body = fillFields(tpl.emailBody, values).trim();

  const primary = safeColor(branding.primaryColor, "#002042");
  const onPrimary = textOn(primary);
  const accent = safeColor(branding.accentColor, primary);
  const actions = tpl.includeActions ? defaultActions(ctx) : [];
  const note = tpl.includeActions ? statusNote(ctx) : "";
  const logo = safeUrl(branding.logoUrl);
  const banner = safeUrl(branding.bannerUrl);

  const project = ctx.project;
  const metaLine = [
    values.data_inicio &&
      `${values.data_inicio}${values.hora_inicio ? ` · ${values.hora_inicio}` : ""}`,
    project?.venueName,
  ]
    .filter(Boolean)
    .join(" — ");
  const heading = project?.name || ctx.tenant.name;

  const buttons = actions
    .map((a) =>
      a.kind === "primary"
        ? `<a href="${escapeHtml(a.url)}" style="display:inline-block;background:${primary};color:${onPrimary};text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin:0 6px 10px;">${escapeHtml(a.label)}</a>`
        : `<a href="${escapeHtml(a.url)}" style="display:inline-block;background:#ffffff;color:${primary};text-decoration:none;padding:13px 26px;border-radius:8px;font-size:15px;font-weight:600;border:1px solid #d5dbe5;margin:0 6px 10px;">${escapeHtml(a.label)}</a>`,
    )
    .join("");

  const footerText =
    branding.footer?.trim() || `${ctx.tenant.name}${project ? ` · ${project.name}` : ""}`;
  const platform =
    branding.showPlatformBrand !== false
      ? `<div style="margin-top:8px;color:#9aa5b5;">Enviado com ${PLATFORM_NAME} · Mais Corporativo</div>`
      : "";

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1b2536;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(body.replace(/\*\*/g, "").slice(0, 140))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e8ef;">
${banner ? `<tr><td><img src="${escapeHtml(banner)}" alt="" width="600" style="display:block;width:100%;height:auto;border:0;"></td></tr>` : ""}
<tr><td style="background:${primary};padding:28px 32px;">
${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(ctx.tenant.name)}" height="32" style="display:block;height:32px;width:auto;border:0;margin:0 0 18px;">` : ""}
<div style="color:${onPrimary};font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(heading)}</div>
${metaLine ? `<div style="color:${onPrimary};opacity:.82;font-size:14px;margin-top:6px;">${escapeHtml(metaLine)}</div>` : ""}
</td></tr>
<tr><td style="padding:32px 32px 16px;">
${paragraphsHtml(body, accent)}
${buttons ? `<div style="text-align:center;padding:12px 0 6px;">${buttons}</div>` : ""}
${note ? `<p style="margin:8px 0 0;text-align:center;font-size:14px;font-weight:600;color:#2f6b3a;">${escapeHtml(note)}</p>` : ""}
${ctx.registration?.shortCode && tpl.includeActions ? `<p style="margin:16px 0 0;text-align:center;font-size:13px;color:#5b6778;">Seu código de acesso: <strong style="font-family:Menlo,Consolas,monospace;letter-spacing:.12em;color:#1b2536;">${escapeHtml(ctx.registration.shortCode)}</strong></p>` : ""}
</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid #eef1f5;font-size:12px;line-height:1.5;color:#6b7686;text-align:center;">
${escapeHtml(footerText)}${platform}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const textActions = actions.map((a) => `${a.label}: ${a.url}`).join("\n");
  const text = [body.replace(/\*\*(.+?)\*\*/g, "$1"), textActions, note]
    .filter(Boolean)
    .join("\n\n");
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export function renderWhatsapp(
  tpl: Pick<TemplateContent, "whatsappBody" | "emailBody" | "includeActions">,
  ctx: MessageContext,
  now: Date = new Date(),
): string {
  const values = buildFieldValues(ctx, now);
  // Sem texto próprio de WhatsApp, aproveita o corpo do e-mail
  const source = tpl.whatsappBody.trim() || tpl.emailBody;
  let text = toWhatsappMarkup(fillFields(source, values));
  if (tpl.includeActions) {
    for (const a of defaultActions(ctx)) {
      // Não duplica o link se o organizador já colocou no texto
      if (!containsUrl(text, a.url)) text += `\n\n*${a.label}:*\n${a.url}`;
    }
    const note = statusNote(ctx);
    if (note) text += `\n\n${note}`;
  }
  return text.trim();
}
