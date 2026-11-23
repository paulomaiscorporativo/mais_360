import "server-only";
import { env, isProd } from "./env";

/**
 * Endereço público do cliente: domínio principal VERIFICADO (quem chama filtra
 * `status: "VERIFIED"`) ou o subdomínio padrão <slug>.<ROOT_DOMAIN>.
 */
export function tenantAddress(t: { slug: string; domains?: { hostname: string }[] }) {
  return t.domains?.[0]?.hostname ?? `${t.slug}.${env.ROOT_DOMAIN}`;
}

export const rootDomain = () => env.ROOT_DOMAIN;

/**
 * Os clientes respondem nos próprios domínios (abiec.mais.tur.br)? Só em produção
 * com um domínio raiz de verdade. Rodando localmente — inclusive `next start`,
 * que também é "production" — os links usam a rota /t/<cliente> do próprio app,
 * porque os domínios dos clientes ainda não apontam para esta máquina.
 */
export function servesTenantDomains(rootDomain = env.ROOT_DOMAIN, production = isProd) {
  const root = rootDomain.trim().toLowerCase();
  const local =
    !root ||
    root === "localhost" ||
    root.endsWith(".localhost") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(root);
  return production && !local;
}
