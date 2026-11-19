import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { homePathFor, loadViewer } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const viewer = await loadViewer();
  if (viewer && !viewer.user.mustChangePassword) redirect(await homePathFor(viewer));
  const { next } = await searchParams;

  return (
    <div className="animate-rise">
      <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
      <p className="text-md text-fg-muted mt-2">Acesse o console da sua operação.</p>
      <LoginForm next={next} />
    </div>
  );
}
