/**
 * DOMÍNIOS PRÓPRIOS DOS CLIENTES — regras puras (sem DNS, sem banco).
 *
 * Fluxo: o administrador cadastra `eventos.cliente.com.br` → fica PENDENTE com
 * um token → o cliente cria dois registros no DNS dele:
 *
 *   CNAME  eventos.cliente.com.br        → <alvo>  (clientes.<ROOT_DOMAIN>)
 *   TXT    _mais360.eventos.cliente.com.br → "mais360-verificacao=<token>"
 *
 * O CNAME faz o endereço chegar à plataforma; o TXT prova que quem cadastrou
 * controla o domínio. O worker consulta o DNS e esta camada interpreta o
 * resultado: VERIFICADO quando os dois conferem.
 *
 * Domínios verificados são reconferidos uma vez por dia, só pelo apontamento
 * (o TXT pode ser apagado depois). Se o apontamento sumir, o domínio vira
 * FALHOU e os links voltam ao subdomínio padrão.
 */

export const DOMAIN_STATUSES = ["PENDING", "VERIFIED", "FAILED"] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

export const DOMAIN_STATUS_LABELS: Record<DomainStatus, string> = {
  PENDING: "Aguardando DNS",
  VERIFIED: "Ativo",
  FAILED: "Com problema",
};

/** Prefixo do registro TXT de verificação: _mais360.<host>. */
export const TXT_LABEL = "_mais360";
const TXT_VALUE_PREFIX = "mais360-verificacao=";

/** Pendentes: tenta de novo a cada 5 min, por até 7 dias desde o cadastro. */
export const PENDING_RECHECK_MS = 5 * 60_000;
export const PENDING_WINDOW_MS = 7 * 86_400_000;
/** Verificados: confere o apontamento uma vez por dia. */
export const VERIFIED_RECHECK_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Hostname
// ---------------------------------------------------------------------------

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
/** TLDs que nunca resolvem na internet pública. */
const RESERVED_TLDS = new Set([
  "localhost",
  "local",
  "internal",
  "test",
  "example",
  "invalid",
  "onion",
  "lan",
  "home",
  "corp",
  "intranet",
  "arpa",
]);

/**
 * Normaliza o que a pessoa digitou: tira esquema, caminho, porta, ponto final
 * e espaços; converte acentos para punycode (IDN). Devolve "" se não der.
 */
export function normalizeHostname(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#]/, 1)[0] ?? "";
  s = s.replace(/^[^@]*@/, ""); // usuário:senha@
  s = s.replace(/:\d*$/, "");
  s = s.replace(/\.+$/, "");
  if (!s || /\s/.test(s)) return s;
  try {
    // URL faz a conversão IDN → punycode (ex.: eventos.ação.com.br)
    return new URL(`http://${s}`).hostname.replace(/\.+$/, "");
  } catch {
    return s;
  }
}

const under = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** O host é da própria plataforma (raiz ou qualquer subdomínio dela)? */
export function isPlatformHost(hostname: string, platformDomains: readonly string[]): boolean {
  const h = normalizeHostname(hostname);
  return platformDomains.some((d) => d && under(h, normalizeHostname(d)));
}

export type HostnameCheck = { ok: true; hostname: string } | { ok: false; error: string };

/**
 * Valida um domínio próprio para cadastro. `platformDomains` são os domínios
 * da plataforma (ROOT_DOMAIN e legados): nenhum endereço dentro deles pode ser
 * cadastrado como domínio próprio — o subdomínio do cliente já existe sozinho.
 */
export function validateCustomHostname(
  input: string,
  opts: { platformDomains: readonly string[]; reservedHosts?: readonly string[] },
): HostnameCheck {
  const host = normalizeHostname(input);
  if (!host)
    return { ok: false, error: "Informe o endereço, por exemplo eventos.suaempresa.com.br." };
  if (host.length > 253) return { ok: false, error: "Endereço longo demais." };
  if (IPV4.test(host) || host.includes(":") || host.startsWith("["))
    return { ok: false, error: "Use um nome de domínio, não um endereço IP." };
  if (host.includes("*")) return { ok: false, error: "Domínios curinga (*) não são aceitos." };
  const labels = host.split(".");
  if (labels.length < 2)
    return {
      ok: false,
      error: "Informe o domínio completo, por exemplo eventos.suaempresa.com.br.",
    };
  if (!labels.every((l) => LABEL.test(l)))
    return {
      ok: false,
      error:
        "Use só letras, números, hífen e pontos (sem espaços, acentos fora do lugar ou símbolos).",
    };
  const tld = labels[labels.length - 1]!;
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld) || RESERVED_TLDS.has(tld))
    return { ok: false, error: "Esse domínio não existe na internet pública." };
  if ((opts.reservedHosts ?? []).some((r) => r && host === normalizeHostname(r)))
    return { ok: false, error: "Esse endereço é reservado pela plataforma." };
  const platform = opts.platformDomains.find((d) => d && under(host, normalizeHostname(d)));
  if (platform)
    return {
      ok: false,
      error: `Endereços em ${normalizeHostname(platform)} são da plataforma. O cliente já tem o subdomínio padrão; cadastre aqui um domínio da própria empresa.`,
    };
  return { ok: true, hostname: host };
}

/** Subdomínio padrão do cliente: <slug>.<ROOT_DOMAIN>. */
export const defaultSubdomain = (slug: string, rootDomain: string) =>
  `${slug}.${normalizeHostname(rootDomain)}`;

/** Host para onde o CNAME aponta: configurável, padrão clientes.<ROOT_DOMAIN>. */
export function customDomainTarget(rootDomain: string, override?: string | null): string {
  const o = normalizeHostname(override ?? "");
  return o || `clientes.${normalizeHostname(rootDomain)}`;
}

/**
 * Domínio "raiz" (eventos.com.br, empresa.com) não aceita CNAME na maioria dos
 * provedores de DNS. Heurística simples para orientar a pessoa: dois rótulos,
 * ou três quando o sufixo é de segundo nível conhecido (com.br, co.uk…).
 */
const SECOND_LEVEL = new Set([
  "com.br",
  "net.br",
  "org.br",
  "gov.br",
  "edu.br",
  "art.br",
  "adv.br",
  "eng.br",
  "ind.br",
  "tur.br",
  "inf.br",
  "co.uk",
  "org.uk",
  "com.ar",
  "com.mx",
  "com.pt",
  "com.co",
  "com.au",
]);

export function isApexDomain(hostname: string): boolean {
  const labels = normalizeHostname(hostname).split(".");
  if (labels.length <= 2) return true;
  return labels.length === 3 && SECOND_LEVEL.has(labels.slice(1).join("."));
}

// ---------------------------------------------------------------------------
// Registros esperados
// ---------------------------------------------------------------------------

export const txtRecordName = (hostname: string) => `${TXT_LABEL}.${normalizeHostname(hostname)}`;
export const txtRecordValue = (token: string) => `${TXT_VALUE_PREFIX}${token}`;

export type ExpectedRecord = {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  purpose: string;
};

export function expectedRecords(
  hostname: string,
  token: string,
  target: string,
): { cname: ExpectedRecord; txt: ExpectedRecord } {
  const host = normalizeHostname(hostname);
  return {
    cname: {
      type: "CNAME",
      name: host,
      value: normalizeHostname(target),
      purpose: "Faz o endereço chegar à plataforma.",
    },
    txt: {
      type: "TXT",
      name: txtRecordName(host),
      value: txtRecordValue(token),
      purpose: "Prova que o domínio é seu. Pode ser apagado depois da verificação.",
    },
  };
}

// ---------------------------------------------------------------------------
// Interpretação da consulta ao DNS
// ---------------------------------------------------------------------------

/** Resultado de uma consulta: valores ou o código de erro do resolvedor. */
export type DnsAnswer<T> = { ok: true; value: T } | { ok: false; code: string };

/** Códigos que indicam "o registro não existe" (resposta definitiva). */
const ABSENT = new Set(["ENODATA", "ENOTFOUND", "NXDOMAIN", "ENONAME"]);
export const isAbsent = (a: DnsAnswer<unknown>) => !a.ok && ABSENT.has(a.code);
/** Falha temporária do resolvedor (timeout, SERVFAIL…): não muda a situação. */
const isTransient = (a: DnsAnswer<unknown>) => !a.ok && !ABSENT.has(a.code);

export type DnsLookup = {
  /** TXT de _mais360.<host> (cada registro em pedaços, como o Node devolve). */
  txt: DnsAnswer<string[][]>;
  /** CNAME do próprio host. */
  cname: DnsAnswer<string[]>;
  /** Endereços (A/AAAA) do host — seguem o CNAME. */
  hostAddresses: DnsAnswer<string[]>;
  /** Endereços (A/AAAA) do alvo. */
  targetAddresses: DnsAnswer<string[]>;
};

export type CheckOutcome = {
  ownership: "ok" | "missing" | "mismatch" | "unknown";
  routing: "ok" | "missing" | "elsewhere" | "unknown";
};

const cleanName = (s: string) => s.trim().toLowerCase().replace(/\.+$/, "");

export function interpretLookup(
  lookup: DnsLookup,
  expected: { token: string; target: string },
): CheckOutcome {
  // Posse: algum TXT igual ao valor esperado
  let ownership: CheckOutcome["ownership"];
  if (lookup.txt.ok) {
    const want = txtRecordValue(expected.token);
    const values = lookup.txt.value.map((chunks) => chunks.join("").trim());
    ownership = values.includes(want)
      ? "ok"
      : values.some((v) => v.startsWith(TXT_VALUE_PREFIX))
        ? "mismatch"
        : "missing";
  } else ownership = isTransient(lookup.txt) ? "unknown" : "missing";

  // Apontamento: CNAME para o alvo, ou os mesmos endereços do alvo
  // (domínio raiz com ALIAS/ANAME ou "achatamento" de CNAME).
  const target = cleanName(expected.target);
  let routing: CheckOutcome["routing"];
  if (lookup.cname.ok && lookup.cname.value.some((c) => cleanName(c) === target)) routing = "ok";
  else if (lookup.hostAddresses.ok && lookup.targetAddresses.ok) {
    const targetSet = new Set(lookup.targetAddresses.value);
    const hits = lookup.hostAddresses.value.filter((ip) => targetSet.has(ip));
    routing = hits.length ? "ok" : lookup.hostAddresses.value.length ? "elsewhere" : "missing";
  } else if (isTransient(lookup.hostAddresses) || isTransient(lookup.targetAddresses))
    routing = "unknown";
  else if (lookup.cname.ok && lookup.cname.value.length) routing = "elsewhere";
  else if (lookup.hostAddresses.ok && lookup.hostAddresses.value.length) routing = "elsewhere";
  else routing = "missing";

  return { ownership, routing };
}

/** Explica o resultado em português simples (vazio quando está tudo certo). */
export function describeOutcome(o: CheckOutcome, mode: "verify" | "recheck"): string {
  const parts: string[] = [];
  if (o.routing === "missing") parts.push("O registro CNAME ainda não aparece no DNS.");
  else if (o.routing === "elsewhere")
    parts.push("O endereço aponta para outro servidor, não para a plataforma. Confira o CNAME.");
  else if (o.routing === "unknown")
    parts.push("O DNS não respondeu a tempo ao conferir o apontamento. Tentaremos de novo.");
  if (mode === "verify") {
    if (o.ownership === "missing") parts.push("O registro TXT de verificação ainda não aparece.");
    else if (o.ownership === "mismatch")
      parts.push("Há um TXT de verificação, mas com outro código. Copie o valor de novo.");
    else if (o.ownership === "unknown")
      parts.push("O DNS não respondeu a tempo ao conferir o TXT. Tentaremos de novo.");
  }
  return parts.join(" ").slice(0, 280);
}

export type DomainState = {
  status: DomainStatus;
  createdAt: Date;
  verifiedAt: Date | null;
};

export type DomainTransition = {
  status: DomainStatus;
  verifiedAt: Date | null;
  lastError: string;
  /** Deixou de funcionar: se era o principal, os links voltam ao subdomínio padrão. */
  lost: boolean;
  /** Acabou de ser verificado. */
  gained: boolean;
};

/**
 * Próxima situação depois de uma consulta.
 *  - VERIFICADO: reconfere só o apontamento; falha definitiva → FALHOU.
 *  - PENDENTE/FALHOU: precisa dos dois registros; sem eles, continua
 *    PENDENTE até 7 dias do cadastro e depois FALHOU.
 *  - Falha temporária do DNS nunca rebaixa um domínio verificado.
 */
export function nextDomainState(
  current: DomainState,
  outcome: CheckOutcome,
  now = new Date(),
): DomainTransition {
  if (current.status === "VERIFIED") {
    if (outcome.routing === "ok")
      return {
        status: "VERIFIED",
        verifiedAt: current.verifiedAt,
        lastError: "",
        lost: false,
        gained: false,
      };
    const lastError = describeOutcome(outcome, "recheck");
    if (outcome.routing === "unknown")
      return {
        status: "VERIFIED",
        verifiedAt: current.verifiedAt,
        lastError,
        lost: false,
        gained: false,
      };
    return {
      status: "FAILED",
      verifiedAt: current.verifiedAt,
      lastError,
      lost: true,
      gained: false,
    };
  }

  if (outcome.ownership === "ok" && outcome.routing === "ok")
    return { status: "VERIFIED", verifiedAt: now, lastError: "", lost: false, gained: true };

  const expired = now.getTime() - current.createdAt.getTime() > PENDING_WINDOW_MS;
  const lastError = describeOutcome(outcome, "verify");
  return {
    status: expired ? "FAILED" : "PENDING",
    verifiedAt: current.verifiedAt,
    lastError: expired
      ? `Não encontramos os registros em 7 dias. ${lastError} Corrija o DNS e clique em "Verificar agora".`.slice(
          0,
          280,
        )
      : lastError,
    lost: false,
    gained: false,
  };
}

/** O domínio está na hora de ser consultado pela varredura periódica? */
export function isDueForCheck(
  d: { status: DomainStatus; lastCheckedAt: Date | null },
  now = new Date(),
): boolean {
  const last = d.lastCheckedAt?.getTime() ?? 0;
  if (d.status === "PENDING") return now.getTime() - last >= PENDING_RECHECK_MS;
  if (d.status === "VERIFIED") return now.getTime() - last >= VERIFIED_RECHECK_MS;
  return false; // FALHOU só volta a ser consultado pelo botão "Verificar agora"
}

// ---------------------------------------------------------------------------
// Pedido de certificado (Caddy on-demand TLS)
// ---------------------------------------------------------------------------

export type TlsAskTarget =
  | { kind: "platform" }
  | { kind: "tenant-subdomain"; slug: string }
  | { kind: "custom"; hostname: string }
  | { kind: "invalid" };

/**
 * Classifica o host de um pedido de certificado, sem banco: o endpoint só
 * consulta o banco para "tenant-subdomain" (cliente ativo) e "custom"
 * (domínio verificado).
 */
export function classifyTlsHost(
  input: string,
  opts: {
    rootDomain: string;
    platformHosts: readonly string[];
    reservedSubdomains: ReadonlySet<string>;
  },
): TlsAskTarget {
  const host = normalizeHostname(input);
  if (!host || host.length > 253 || !host.split(".").every((l) => LABEL.test(l)))
    return { kind: "invalid" };
  if (opts.platformHosts.some((p) => p && normalizeHostname(p) === host))
    return { kind: "platform" };
  const root = normalizeHostname(opts.rootDomain);
  if (host === root) return { kind: "platform" };
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (!sub || sub.includes(".") || opts.reservedSubdomains.has(sub)) return { kind: "invalid" };
    return { kind: "tenant-subdomain", slug: sub };
  }
  return { kind: "custom", hostname: host };
}

/** Fila do worker que consulta o DNS de um domínio (payload: { domainId }). */
export const DOMAINS_VERIFY_QUEUE = "domains.verify";
export const domainCheckKey = (domainId: string) => `domains.verify:${domainId}`;

/** Domínios antigos da plataforma, além do ROOT_DOMAIN (endereços legados com QR impresso). */
export const LEGACY_PLATFORM_DOMAINS = ["mais.tur.br"] as const;

/** Domínios da plataforma: ROOT_DOMAIN + legados (sem repetição). */
export const platformDomainsFor = (rootDomain: string) => [
  ...new Set([normalizeHostname(rootDomain), ...LEGACY_PLATFORM_DOMAINS].filter(Boolean)),
];
