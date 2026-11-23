"use client";

import { Check, FolderLock, MoreHorizontal, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { TENANT_ROLE_INFO, TENANT_ROLES, type TenantRoleKey } from "@mais/core";
import { Button, EmptyState, Notice } from "@/components/ui";
import { Checkbox, Select } from "@/components/ui/controls";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuTrigger,
  Sheet,
} from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { useAccessActions } from "@/components/team/access-actions";
import { InviteSheet } from "@/components/team/invite-sheet";
import { TeamList, TeamMemberRow, type TeamMemberView } from "@/components/team/member-row";
import { cn } from "@/lib/cn";
import { addMember, removeMember, updateMemberRole } from "@/app/console/[ws]/actions";
import {
  deactivateTenantMember,
  reactivateTenantMember,
  resendTenantInvite,
  sendTenantMemberReset,
  updateMemberProjects,
} from "./actions";

const ROLES = TENANT_ROLES.map((value) => ({ value, ...TENANT_ROLE_INFO[value] }));
const roleLabel = (r: TenantRoleKey) => TENANT_ROLE_INFO[r].label;

type Member = TeamMemberView & {
  id: string;
  role: TenantRoleKey;
  allProjects: boolean;
  projectAccess: { projectId: string; role: TenantRoleKey | null }[];
  canDeactivate: boolean;
};

type Project = { id: string; name: string };

export function TeamManager({
  tenant,
  members,
  projects,
  canEdit,
  currentUserId,
}: {
  tenant: string;
  members: Member[];
  projects: Project[];
  canEdit: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [scoping, setScoping] = useState<Member | null>(null);
  const [pending, start] = useTransition();

  const access = useAccessActions({
    contextLabel: "deste cliente",
    handlers: {
      resend: (membershipId) => resendTenantInvite({ tenant, membershipId }),
      reset: (membershipId) => sendTenantMemberReset({ tenant, membershipId }),
      deactivate: (membershipId) => deactivateTenantMember({ tenant, membershipId }),
      reactivate: (membershipId) => reactivateTenantMember({ tenant, membershipId }),
      remove: (membershipId) => removeMember({ tenant, membershipId }),
    },
  });

  const changeRole = (m: Member, role: TenantRoleKey) =>
    start(async () => {
      const r = await updateMemberRole({ tenant, membershipId: m.id, role });
      if (r.ok) {
        toast.success(`${m.name} agora é ${roleLabel(role)}.`);
        router.refresh();
      } else toast.error(r.error);
    });

  const scopeLabel = (m: Member) =>
    m.role === "ADMIN" || m.allProjects
      ? null
      : m.projectAccess.length === 1
        ? "1 projeto"
        : `${m.projectAccess.length} projetos`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <p className="text-fg-muted text-base">
          Quem opera este cliente, com qual papel e em quais projetos.
        </p>
        {canEdit && members.length > 0 && (
          <Button onClick={() => setInviting(true)}>
            <UserPlus /> Convidar pessoa
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Monte a equipe do cliente"
          description="Convide quem vai operar: administradores, gestores, balcão de credenciamento e leitores de acesso. Cada pessoa cria a própria senha pelo convite."
          action={
            canEdit && (
              <Button onClick={() => setInviting(true)}>
                <UserPlus /> Convidar pessoa
              </Button>
            )
          }
        />
      ) : (
        <TeamList label="Equipe do cliente">
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            return (
              <TeamMemberRow
                key={m.id}
                member={m}
                isSelf={isSelf}
                roleLabel={roleLabel(m.role)}
                extra={scopeLabel(m)}
                actions={
                  canEdit && (
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
                        {m.role !== "ADMIN" && (
                          <MenuItem onSelect={() => setScoping(m)}>
                            <FolderLock />
                            <span className="flex-1">Acesso por projeto</span>
                            <span className="text-fg-subtle text-sm">
                              {scopeLabel(m) ?? "Todos"}
                            </span>
                          </MenuItem>
                        )}
                        {access.menuItems({
                          key: m.id,
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
        title="Convidar pessoa"
        description="Quem ainda não tem conta recebe um convite por e-mail para criar a própria senha."
        roles={ROLES}
        defaultRole="OPERATOR"
        contextLabel="a este cliente"
        submit={(input) => addMember({ tenant, ...input })}
        onDone={() => router.refresh()}
      />

      <ProjectAccessSheet
        tenant={tenant}
        member={scoping}
        projects={projects}
        onClose={() => setScoping(null)}
        onDone={() => router.refresh()}
      />

      {access.dialogs}
    </>
  );
}

// ---------------------------------------------------------------------------
// Acesso por projeto: todos ou uma lista, com papel opcional por projeto
// ---------------------------------------------------------------------------

const INHERIT = "__inherit";

function ProjectAccessSheet({
  tenant,
  member,
  projects,
  onClose,
  onDone,
}: {
  tenant: string;
  member: Member | null;
  projects: Project[];
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <Sheet
      open={!!member}
      onOpenChange={(o) => !o && onClose()}
      title={member ? `Projetos de ${member.name.split(" ")[0]}` : "Acesso por projeto"}
      description="Defina se a pessoa opera todos os projetos do cliente ou só alguns."
      size="lg"
    >
      {member && (
        <ProjectAccessForm
          key={member.id}
          tenant={tenant}
          member={member}
          projects={projects}
          onClose={onClose}
          onDone={onDone}
        />
      )}
    </Sheet>
  );
}

function ProjectAccessForm({
  tenant,
  member,
  projects,
  onClose,
  onDone,
}: {
  tenant: string;
  member: Member;
  projects: Project[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [all, setAll] = useState(member.allProjects);
  const [picked, setPicked] = useState<Map<string, TenantRoleKey | null>>(
    () => new Map(member.projectAccess.map((p) => [p.projectId, p.role])),
  );
  const [pending, start] = useTransition();
  const roleOptions = useMemo(
    () => [
      { value: INHERIT, label: `Papel do vínculo (${roleLabel(member.role)})` },
      ...ROLES.filter((r) => r.value !== "ADMIN").map((r) => ({
        value: r.value,
        label: r.label,
        description: r.description,
      })),
    ],
    [member.role],
  );

  const toggle = (id: string, on: boolean) =>
    setPicked((cur) => {
      const next = new Map(cur);
      if (on) next.set(id, next.get(id) ?? null);
      else next.delete(id);
      return next;
    });

  function save() {
    start(async () => {
      const r = await updateMemberProjects({
        tenant,
        membershipId: member.id,
        allProjects: all,
        projects: [...picked].map(([projectId, role]) => ({ projectId, role })),
      });
      if (r.ok) {
        toast.success(
          all
            ? `${member.name} opera todos os projetos.`
            : `Acesso de ${member.name} restrito a ${picked.size} ${picked.size === 1 ? "projeto" : "projetos"}.`,
        );
        onDone();
        onClose();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Alcance</legend>
        {[
          { value: true, title: "Todos os projetos", text: "Inclui os que forem criados depois." },
          {
            value: false,
            title: "Só alguns projetos",
            text: "Escolha abaixo, com papel por projeto se quiser.",
          },
        ].map((o) => (
          <label
            key={String(o.value)}
            className={cn(
              "border-border bg-surface hover:border-border-strong flex cursor-pointer gap-3 rounded-md border p-4 transition-colors",
              "has-[:focus-visible]:outline-brand-ring has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
              all === o.value && "border-brand ring-brand ring-1",
            )}
          >
            <input
              type="radio"
              name="scope"
              className="accent-brand mt-1"
              checked={all === o.value}
              onChange={() => setAll(o.value)}
            />
            <span>
              <span className="block text-base font-medium">{o.title}</span>
              <span className="text-fg-subtle mt-0.5 block text-sm">{o.text}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {!all &&
        (projects.length === 0 ? (
          <Notice tone="info" title="Este cliente ainda não tem projetos">
            Crie um projeto antes de restringir o acesso, ou mantenha “Todos os projetos”.
          </Notice>
        ) : (
          <ul
            aria-label="Projetos do cliente"
            className="divide-border border-border divide-y rounded-md border"
          >
            {projects.map((p) => {
              const on = picked.has(p.id);
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <Checkbox checked={on} onCheckedChange={(v) => toggle(p.id, v === true)} />
                    <span className="truncate text-base">{p.name}</span>
                  </label>
                  {on && (
                    <Select
                      aria-label={`Papel em ${p.name}`}
                      className="sm:w-60"
                      value={picked.get(p.id) ?? INHERIT}
                      onValueChange={(v) =>
                        setPicked((cur) =>
                          new Map(cur).set(p.id, v === INHERIT ? null : (v as TenantRoleKey)),
                        )
                      }
                      options={roleOptions}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        ))}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={save} loading={pending} disabled={!all && picked.size === 0}>
          Salvar acesso
        </Button>
      </div>
    </div>
  );
}
