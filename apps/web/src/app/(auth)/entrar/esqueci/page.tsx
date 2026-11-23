import type { Metadata } from "next";
import { ForgotForm } from "./form";

export const metadata: Metadata = { title: "Esqueci a senha" };

export default function ForgotPage() {
  return (
    <div className="animate-rise">
      <h1 className="text-2xl font-semibold tracking-tight">Esqueci a senha</h1>
      <p className="text-md text-fg-muted mt-2">
        Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.
      </p>
      <ForgotForm />
    </div>
  );
}
