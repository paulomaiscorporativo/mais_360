import type { Metadata } from "next";
import { LinkProblem, loadLinkState } from "../../link-state";
import { SetPasswordForm } from "../../set-password-form";

// O token está no endereço: não vaza por Referer nem fica em cache
export const metadata: Metadata = {
  title: "Ativar acesso",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await loadLinkState(token, "INVITE");
  if (!state.ok) return <LinkProblem title="Convite indisponível" message={state.message} />;

  return (
    <div className="animate-rise">
      <h1 className="text-2xl font-semibold tracking-tight">
        Boas-vindas, {state.name.split(" ")[0]}
      </h1>
      <p className="text-md text-fg-muted mt-2">
        Crie a senha da sua conta <span className="text-fg font-medium">{state.email}</span>. Depois
        disso, você entra direto no console.
      </p>
      <SetPasswordForm
        token={token}
        purpose="INVITE"
        email={state.email}
        submitLabel="Ativar e entrar"
      />
    </div>
  );
}
