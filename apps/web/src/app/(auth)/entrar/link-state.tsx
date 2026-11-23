import "server-only";
import { Link2Off } from "lucide-react";
import Link from "next/link";
import { accessTokenProblem, type AccessTokenPurpose } from "@mais/core";
import { Button } from "@/components/ui";
import { findAccessToken } from "@/server/access";

export type LinkState =
  { ok: true; name: string; email: string; expiresAt: Date } | { ok: false; message: string };

/** Confere o link de convite/redefinição antes de mostrar o formulário. */
export async function loadLinkState(raw: string, purpose: AccessTokenPurpose): Promise<LinkState> {
  const token = await findAccessToken(raw);
  const problem = accessTokenProblem(token && token.purpose === purpose ? token : null);
  if (problem || !token) return { ok: false, message: problem ?? "Este link não é válido." };
  if (!token.user.active)
    return { ok: false, message: "Esta conta está desativada. Fale com o administrador." };
  return {
    ok: true,
    name: token.user.name,
    email: token.user.email,
    expiresAt: token.expiresAt,
  };
}

/** Estado de erro desenhado: o que aconteceu e o que fazer. */
export function LinkProblem({
  title,
  message,
  showForgot,
}: {
  title: string;
  message: string;
  showForgot?: boolean;
}) {
  return (
    <div className="animate-rise">
      <div className="border-border bg-surface text-fg-subtle mb-6 grid size-11 place-items-center rounded-md border shadow-sm">
        <Link2Off className="size-5" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-md text-fg-muted mt-2">{message}</p>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/entrar">Ir para o login</Link>
        </Button>
        {showForgot && (
          <Button asChild size="lg" variant="secondary">
            <Link href="/entrar/esqueci">Pedir novo link</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
