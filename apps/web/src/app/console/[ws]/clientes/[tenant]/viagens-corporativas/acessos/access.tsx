"use client";

import { Copy, KeyRound, Search, UserX, Users } from "lucide-react";
import { useState } from "react";
import { SectionTitle, useRunAction } from "@/components/travel/kit";
import { Badge, Button, EmptyState, Input, Notice } from "@/components/ui";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { grantMemberAccess, revokeMemberAccess } from "../actions";

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  memberType: string;
  hasAccess: boolean;
  provisional: boolean;
  lastLogin: string;
};

/**
 * Acesso à área do associado: a equipe gera uma senha provisória (mostrada
 * uma vez, para repassar por um canal seguro); no primeiro acesso a pessoa
 * troca a senha. Gerar de novo ou revogar derruba as sessões abertas.
 */
export function MemberAccessList({
  tenant,
  rows,
  query,
  loginUrl,
}: {
  tenant: string;
  rows: MemberRow[];
  query: string;
  loginUrl: string;
}) {
  const { run, pending } = useRunAction();
  const [issued, setIssued] = useState<{ name: string; login: string; password: string } | null>(
    null,
  );
  const [revoking, setRevoking] = useState<MemberRow | null>(null);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle className="mb-0">
          {query ? `Pessoas com “${query}”` : "Associados com acesso à área"}
        </SectionTitle>
        <form method="get" role="search" className="relative">
          <Search className="text-fg-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={query}
            placeholder="Buscar pessoa por nome ou e-mail"
            aria-label="Buscar pessoa"
            className="w-72 max-w-full pl-9"
          />
        </form>
      </div>
      <p className="text-fg-subtle text-sm">
        Endereço da área: <span className="text-fg font-mono text-xs">{loginUrl}</span>
      </p>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={query ? "Ninguém encontrado" : "Nenhum associado com acesso ainda"}
          description="Busque a pessoa pelo nome ou e-mail e gere uma senha provisória. Ela entra com o e-mail do cadastro e troca a senha no primeiro acesso."
        />
      ) : (
        <ul className="border-border divide-border bg-surface divide-y rounded-lg border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-fg-subtle truncate text-xs">
                  {r.email || "Sem e-mail no cadastro"}
                  {r.memberType ? ` · ${r.memberType}` : ""}
                  {r.lastLogin ? ` · último acesso ${r.lastLogin}` : ""}
                </p>
              </div>
              {r.hasAccess ? (
                <Badge tone={r.provisional ? "warning" : "success"} size="sm" dot>
                  {r.provisional ? "Senha provisória" : "Com acesso"}
                </Badge>
              ) : (
                <Badge size="sm">Sem acesso</Badge>
              )}
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!r.email}
                  loading={pending}
                  onClick={() =>
                    run(() => grantMemberAccess({ tenant, personId: r.id }), {
                      onSuccess: (d) => setIssued({ name: r.name, ...d }),
                    })
                  }
                >
                  <KeyRound /> {r.hasAccess ? "Nova senha" : "Liberar acesso"}
                </Button>
                {r.hasAccess && (
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    aria-label={`Revogar acesso de ${r.name}`}
                    onClick={() => setRevoking(r)}
                  >
                    <UserX />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={issued !== null}
        onOpenChange={(o) => !o && setIssued(null)}
        title="Senha provisória gerada"
        description={issued?.name}
        footer={<Button onClick={() => setIssued(null)}>Concluir</Button>}
      >
        {issued && (
          <div className="flex flex-col gap-4">
            <Notice tone="warning">
              Esta senha aparece só agora. Repasse por um canal seguro; no primeiro acesso a pessoa
              cria a própria senha.
            </Notice>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-fg-subtle text-xs">Endereço</dt>
                <dd className="font-mono text-xs break-all">{loginUrl}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle text-xs">Login (e-mail)</dt>
                <dd>{issued.login}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle text-xs">Senha provisória</dt>
                <dd className="flex items-center gap-2">
                  <span className="bg-surface-muted rounded-sm px-2 py-1 font-mono text-base tracking-wider">
                    {issued.password}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copiar senha"
                    onClick={() => copy(issued.password)}
                  >
                    <Copy />
                  </Button>
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revogar o acesso?"
        description={`${revoking?.name ?? ""} deixa de entrar na área do associado e as sessões abertas caem agora. As solicitações continuam no histórico.`}
        confirmLabel="Revogar acesso"
        tone="danger"
        loading={pending}
        onConfirm={() =>
          revoking &&
          run(() => revokeMemberAccess({ tenant, personId: revoking.id }), {
            success: "Acesso revogado.",
            onSuccess: () => setRevoking(null),
          })
        }
      />
    </div>
  );
}
