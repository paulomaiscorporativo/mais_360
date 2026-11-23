"use client";

import { Check, MoreHorizontal, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { WORKSPACE_ROLE_INFO, WORKSPACE_ROLES, type WorkspaceRoleKey } from "@mais/core";
import { Button, EmptyState } from "@/components/ui";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { useAccessActions } from "@/components/team/access-actions";
import { InviteSheet } from "@/components/team/invite-sheet";
import { TeamList, TeamMemberRow, type TeamMemberView } from "@/components/team/member-row";
import {
  deactivateWorkspaceMember,
  inviteToWorkspace,
  reactivateWorkspaceMember,
  removeWorkspaceMember,
  resendWorkspaceInvite,
  sendWorkspaceMemberReset,
  updateWorkspaceMemberRole,
} from "./actions";

const ROLES = WORKSPACE_ROLES.map((value) => ({ value, ...WORKSPACE_ROLE_INFO[value] }));
const roleLabel = (r: WorkspaceRoleKey) => WORKSPACE_ROLE_INFO[r].label;

type Member = TeamMemberView & {
  role: WorkspaceRoleKey;
  tenants: number;
  canDeactivate: boolean;
};

export function WorkspaceTeam({
  ws,
  members,
  viewerRole,
  canEdit,
  currentUserId,
}: {
  ws: string;
  members: Member[];
  viewerRole: WorkspaceRoleKey;
  canEdit: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [pending, start] = useTransition();
  // Só um dono mexe em donos (convidar, promover, rebaixar)
  const isOwner = viewerRole === "OWNER";
  const assignable = ROLES.filter((r) => isOwner || r.value !== "OWNER");

  const access = useAccessActions({
    contextLabel: "deste assinante",
    handlers: {
      resend: (userId) => resendWorkspaceInvite({ ws, userId }),
      reset: (userId) => sendWorkspaceMemberReset({ ws, userId }),
      deactivate: (userId) => deactivateWorkspaceMember({ ws, userId }),
      reactivate: (userId) => reactivateWorkspaceMember({ ws, userId }),
      remove: (userId) => removeWorkspaceMember({ ws, userId }),
    },
  });

  const changeRole = (m: Member, role: WorkspaceRoleKey) =>
    start(async () => {
      const r = await updateWorkspaceMemberRole({ ws, userId: m.userId, role });
      if (r.ok) {
        toast.success(`${m.name} agora é ${roleLabel(role)}.`);
        router.refresh();
      } else toast.error(r.error);
    });

  const tenantsLabel = (m: Member) =>
    m.role === "OWNER" || m.role === "ADMIN"
      ? "Todos os clientes"
      : m.tenants === 0
        ? "Sem clientes"
        : `${m.tenants} ${m.tenants === 1 ? "cliente" : "clientes"}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <p className="text-fg-muted text-base">
          Operadores e financeiro acessam só os clientes em que forem incluídos.
        </p>
        {canEdit && (
          <Button onClick={() => setInviting(true)}>
            <UserPlus /> Convidar pessoa
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Monte a equipe do assinante"
          description="Convide quem administra a conta e quem opera os clientes. Cada pessoa cria a própria senha pelo convite."
          action={
            canEdit && (
              <Button onClick={() => setInviting(true)}>
                <UserPlus /> Convidar pessoa
              </Button>
            )
          }
        />
      ) : (
        <TeamList label="Equipe do assinante">
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            const lockedOwner = m.role === "OWNER" && !isOwner;
            return (
              <TeamMemberRow
                key={m.userId}
                member={m}
                isSelf={isSelf}
                roleLabel={roleLabel(m.role)}
                extra={tenantsLabel(m)}
                actions={
                  canEdit &&
                  !lockedOwner && (
                    <Menu>
                      <MenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Ações para ${m.name}`}
                          disabled={pending || access.pending}
                        >
                          <MoreHorizontal />
                        </Button>
                      </MenuTrigger>
                      <MenuContent className="w-72">
                        <MenuLabel>Papel</MenuLabel>
                        {assignable.map((r) => (
                          <MenuItem
                            key={r.value}
                            onSelect={() => r.value !== m.role && changeRole(m, r.value)}
                          >
                            <span className="flex-1">{r.label}</span>
                            {m.role === r.value && <Check className="!text-brand-text" />}
                          </MenuItem>
                        ))}
                        {access.menuItems({
                          key: m.userId,
                          name: m.name,
                          email: m.email,
                          status: m.status,
                          isSelf,
                          canDeactivate: m.canDeactivate,
                        })}
                      </MenuContent>
                    </Menu>
                  )
                }
              />
            );
          })}
        </TeamList>
      )}

      <InviteSheet
        open={inviting}
        onOpenChange={setInviting}
        title="Convidar para o assinante"
        description="Quem ainda não tem conta recebe um convite por e-mail para criar a própria senha."
        roles={assignable}
        defaultRole="OPERATOR"
        contextLabel="ao assinante"
        submit={(input) => inviteToWorkspace({ ws, ...input })}
        onDone={() => router.refresh()}
      />
      {access.dialogs}
    </>
  );
}
