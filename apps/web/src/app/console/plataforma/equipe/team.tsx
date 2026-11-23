"use client";

import { Check, MoreHorizontal, ShieldCheck, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PLATFORM_ROLE_INFO } from "@mais/core";
import { Button, EmptyState } from "@/components/ui";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { useAccessActions } from "@/components/team/access-actions";
import { InviteSheet } from "@/components/team/invite-sheet";
import { TeamList, TeamMemberRow, type TeamMemberView } from "@/components/team/member-row";
import {
  deactivatePlatformMember,
  invitePlatformMember,
  reactivatePlatformMember,
  resendPlatformInvite,
  sendPlatformMemberReset,
  updatePlatformRole,
} from "./actions";

type StaffRole = "SUPERADMIN" | "SUPPORT";
const ROLES = (["SUPERADMIN", "SUPPORT"] as const).map((value) => ({
  value,
  ...PLATFORM_ROLE_INFO[value],
}));

type Member = TeamMemberView & { role: StaffRole };

export function PlatformTeam({
  members,
  currentUserId,
}: {
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [pending, start] = useTransition();

  const access = useAccessActions({
    contextLabel: "da equipe da plataforma",
    handlers: {
      resend: (userId) => resendPlatformInvite({ userId }),
      reset: (userId) => sendPlatformMemberReset({ userId }),
      deactivate: (userId) => deactivatePlatformMember({ userId }),
      reactivate: (userId) => reactivatePlatformMember({ userId }),
      remove: (userId) => updatePlatformRole({ userId, role: "NONE" }),
    },
  });

  const changeRole = (m: Member, role: StaffRole) =>
    start(async () => {
      const r = await updatePlatformRole({ userId: m.userId, role });
      if (r.ok) {
        toast.success(`${m.name} agora é ${PLATFORM_ROLE_INFO[role].label}.`);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <p className="text-fg-muted text-base">
          {members.length} {members.length === 1 ? "pessoa" : "pessoas"} com acesso à plataforma.
        </p>
        <Button onClick={() => setInviting(true)}>
          <UserPlus /> Convidar pessoa
        </Button>
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="Convide a equipe da plataforma"
          description="Superadmins administram assinantes e planos; o suporte atende os assinantes em modo assistido."
          action={
            <Button onClick={() => setInviting(true)}>
              <UserPlus /> Convidar pessoa
            </Button>
          }
        />
      ) : (
        <TeamList label="Equipe da plataforma">
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            return (
              <TeamMemberRow
                key={m.userId}
                member={m}
                isSelf={isSelf}
                roleLabel={PLATFORM_ROLE_INFO[m.role].label}
                actions={
                  !isSelf && (
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
                        {ROLES.map((r) => (
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
                          canDeactivate: true,
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
        title="Convidar para a plataforma"
        description="A pessoa recebe um convite por e-mail para criar a própria senha."
        roles={ROLES}
        defaultRole="SUPPORT"
        contextLabel="à plataforma"
        submit={(input) => invitePlatformMember(input)}
        onDone={() => router.refresh()}
      />
      {access.dialogs}
    </>
  );
}
