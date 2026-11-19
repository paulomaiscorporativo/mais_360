import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { NewPasswordForm } from "./form";

export const metadata: Metadata = { title: "Definir nova senha" };

export default async function NewPasswordPage() {
  const viewer = await requireUser({ allowPasswordChange: true });
  const first = viewer.user.mustChangePassword;
  return (
    <div className="animate-rise">
      <h1 className="text-2xl font-semibold tracking-tight">{first ? "Defina sua senha" : "Trocar senha"}</h1>
      <p className="mt-2 text-md text-fg-muted">
        {first
          ? `Olá, ${viewer.user.name.split(" ")[0]}. Antes de começar, troque a senha provisória por uma só sua.`
          : "Ao trocar a senha, os outros dispositivos conectados serão desconectados."}
      </p>
      <NewPasswordForm />
    </div>
  );
}
