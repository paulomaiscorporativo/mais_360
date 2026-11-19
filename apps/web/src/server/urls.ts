import "server-only";
import { env } from "./env";

/** Endereço público do cliente: domínio principal cadastrado ou <slug>.<ROOT_DOMAIN>. */
export function tenantAddress(t: { slug: string; domains?: { hostname: string }[] }) {
  return t.domains?.[0]?.hostname ?? `${t.slug}.${env.ROOT_DOMAIN}`;
}

export const rootDomain = () => env.ROOT_DOMAIN;
