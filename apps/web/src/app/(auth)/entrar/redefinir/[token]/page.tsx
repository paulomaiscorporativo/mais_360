import type { Metadata } from "next";
import { LinkProblem, loadLinkState } from "../../link-state";
import { SetPasswordForm } from "../../set-password-form";

// O token está no endereço: não vaza por Referer nem fica em cache
export const metadata: Metadata = {
  title: "Redefinir senha",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await loadLinkState(token, "PASSWORD_RESET");
  if (!state.ok)
    return <LinkProblem title="Link indisponível" message={state.message} showForgot />;

  return (
    <div className="animate-rise">
      <h1 className="text-2xl font-semibold tracking-tight">Crie uma nova senha</h1>
      <p className="text-md text-fg-muted mt-2">
        Para a conta <span className="text-fg font-medium">{state.email}</span>. Ao salvar, os
        outros dispositivos conectados serão desconectados.
      </p>
      <SetPasswordForm
        token={token}
        purpose="PASSWORD_RESET"
        email={state.email}
        submitLabel="Salvar e entrar"
      />
    </div>
  );
}
