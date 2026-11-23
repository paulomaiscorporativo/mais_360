import { CircleAlert, Info, Lock } from "lucide-react";
import { CANCELED_ACCESS_ERROR } from "@mais/core/workspaces";
import { EmptyState, Notice } from "@/components/ui";
import { PRODUCT } from "@/config/product";
import { requireUser } from "@/server/auth";
import { workspaceStatusFor } from "@/server/workspace-status";

/**
 * Faixa de situação do assinante (pagamento pendente, suspenso, fim do teste)
 * em todo o console dele, e tela de acesso encerrado quando cancelado.
 * A trava de verdade está no servidor (enforceWorkspaceStatus em server/auth.ts):
 * aqui é só a comunicação.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string }>;
}) {
  const viewer = await requireUser();
  const state = await workspaceStatusFor(viewer, (await params).ws);
  if (!state) return children;

  if (state.access === "blocked" && !viewer.isPlatformStaff) {
    return (
      <EmptyState
        className="mt-8"
        icon={<Lock />}
        title={`O acesso a ${state.workspace.name} foi encerrado`}
        description={CANCELED_ACCESS_ERROR}
        action={
          <a
            className="text-brand-text text-sm font-medium underline-offset-4 hover:underline"
            href={`mailto:${PRODUCT.supportEmail}`}
          >
            {PRODUCT.supportEmail}
          </a>
        }
      />
    );
  }

  const staffNote =
    viewer.isPlatformStaff && state.access !== "full"
      ? viewer.isSuperadmin
        ? " Você está como superadmin da plataforma e pode alterar dados mesmo assim."
        : " Você está como suporte da plataforma: somente consulta."
      : "";
  const banner =
    state.banner ??
    (state.access === "blocked"
      ? {
          tone: "danger" as const,
          title: "Assinatura cancelada",
          message: "A equipe do assinante não tem mais acesso a este console.",
        }
      : null);

  return (
    <>
      {banner && (
        <Notice
          className="mb-6"
          tone={banner.tone}
          title={banner.title}
          icon={
            banner.tone === "info" ? (
              <Info />
            ) : banner.tone === "danger" ? (
              <Lock />
            ) : (
              <CircleAlert />
            )
          }
        >
          {banner.message}
          {staffNote}
        </Notice>
      )}
      {children}
    </>
  );
}
