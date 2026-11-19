import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (antigo middleware, Next 16).
 *
 * 1. Resolução do cliente pelo domínio:
 *      abiec.<ROOT_DOMAIN>/…     → /t/abiec/…
 *      eventos.abiec.com.br/…    → /t/_host/…  (+ cabeçalho x-tenant-host; a página
 *                                  resolve o domínio próprio em TenantDomain)
 *    O domínio raiz (e app./www.) serve o console normalmente.
 * 2. Checagem otimista de sessão no console: sem cookie, vai ao login.
 *    A validação real (sessão revogável no banco) acontece no servidor.
 */

const ROOT_DOMAIN = (process.env.ROOT_DOMAIN ?? "localhost").toLowerCase();
const RESERVED = new Set(["www", "app", "console", "api"]);
const SESSION_COOKIE = "mais_session";

function hostname(req: NextRequest) {
  return (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "")
    .split(":")[0]!
    .toLowerCase();
}

export function proxy(req: NextRequest) {
  const host = hostname(req);
  const { pathname, search } = req.nextUrl;

  const sub = host.endsWith(`.${ROOT_DOMAIN}`) ? host.slice(0, -(ROOT_DOMAIN.length + 1)) : null;
  const isRoot =
    host === ROOT_DOMAIN || host === "127.0.0.1" || (sub !== null && RESERVED.has(sub));

  if (!isRoot && host) {
    if (sub !== null) {
      const slug = sub;
      if (slug && !slug.includes(".")) {
        const url = req.nextUrl.clone();
        url.pathname = `/t/${slug}${pathname === "/" ? "" : pathname}`;
        return NextResponse.rewrite(url);
      }
    } else {
      const url = req.nextUrl.clone();
      url.pathname = `/t/_host${pathname === "/" ? "" : pathname}`;
      const headers = new Headers(req.headers);
      headers.set("x-tenant-host", host);
      return NextResponse.rewrite(url, { request: { headers } });
    }
  }

  if (pathname.startsWith("/console") && !req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
