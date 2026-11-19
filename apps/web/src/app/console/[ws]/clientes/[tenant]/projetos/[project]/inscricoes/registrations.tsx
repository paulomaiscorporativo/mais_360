"use client";

import {
  FileSpreadsheet,
  MoreHorizontal,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Badge, Button, EmptyState, Input, Notice } from "@/components/ui";
import { Checkbox, Select } from "@/components/ui/controls";
import { DataTable } from "@/components/ui/data-table";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { updateRegistration } from "./actions";
import { AddRegistrationSheet } from "./add-sheet";
import { ImportSheet } from "./import-sheet";
import { STATUS, type Status } from "./status";

export type Label = { id: string; name: string; color: string };

export type RegistrationRow = {
  id: string;
  personId: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  status: Status;
  role: string;
  source: string;
  shortCode: string;
  category: Label | null;
  group: Label | null;
  companionOf: string | null;
  checkedIn: boolean;
};

export function LabelDot({ label }: { label: Label }) {
  return (
    <Badge size="sm">
      <span className="size-2 rounded-full" style={{ background: label.color }} />
      {label.name}
    </Badge>
  );
}

export function RegistrationsManager(props: {
  ws: string;
  tenant: string;
  projectSlug: string;
  projectId: string;
  canEdit: boolean;
  rows: RegistrationRow[];
  total: number;
  truncated: boolean;
  categories: Label[];
  groups: Label[];
  filters: { q: string; status: string; cat: string };
}) {
  const { rows, categories, groups, canEdit, tenant, projectId } = props;
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(props.filters.q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pending, start] = useTransition();

  // Busca com atraso, refletida na URL (compartilhável, sobrevive ao recarregar)
  useEffect(() => {
    if (q === props.filters.q) return;
    const t = setTimeout(() => setParam("q", q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const visibleIds = rows.map((r) => r.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function patch(ids: string[], data: { status?: Status; categoryId?: string | null; groupId?: string | null }, done: string) {
    start(async () => {
      const r = await updateRegistration({ tenant, projectId, ids, patch: data });
      if (r.ok) {
        toast.success(done.replace("{n}", String(r.data.count)));
        setSelected(new Set());
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const hasFilters = !!props.filters.q || props.filters.status !== "ACTIVE" || !!props.filters.cat;
  const empty = rows.length === 0 && !hasFilters;

  return (
    <>
      {empty ? (
        <EmptyState
          icon={<Users />}
          title="Traga as primeiras inscrições"
          description="Importe uma planilha (o sistema reconhece as colunas sozinho e não duplica quem já existe) ou adicione pessoas uma a uma."
          action={
            canEdit && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setImporting(true)}>
                  <FileSpreadsheet /> Importar planilha
                </Button>
                <Button variant="secondary" onClick={() => setAdding(true)}>
                  <UserPlus /> Adicionar pessoa
                </Button>
              </div>
            )
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome, empresa, e-mail ou código"
                leading={<Search />}
                trailing={
                  q && (
                    <button
                      type="button"
                      onClick={() => setQ("")}
                      className="hover:text-fg rounded p-1"
                      aria-label="Limpar busca"
                    >
                      <X className="size-3.5" />
                    </button>
                  )
                }
                aria-label="Buscar inscrições"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex">
              <Select
                value={props.filters.status}
                onValueChange={(v) => setParam("status", v === "ACTIVE" ? "" : v)}
                options={[
                  { value: "ACTIVE", label: "Ativas" },
                  ...Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
                  { value: "ALL", label: "Todas" },
                ]}
                className="md:w-40"
              />
              <Select
                value={props.filters.cat || "any"}
                onValueChange={(v) => setParam("cat", v === "any" ? "" : v)}
                options={[
                  { value: "any", label: "Todas as categorias" },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                  { value: "none", label: "Sem categoria" },
                ]}
                className="md:w-48"
              />
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setImporting(true)} className="flex-1 md:flex-none">
                  <FileSpreadsheet /> Importar
                </Button>
                <Button onClick={() => setAdding(true)} className="flex-1 md:flex-none">
                  <UserPlus /> Adicionar
                </Button>
              </div>
            )}
          </div>

          <p className="text-fg-subtle mb-2 text-sm" aria-live="polite">
            {props.total === 0
              ? "Nenhuma inscrição com estes filtros."
              : `${props.total} ${props.total === 1 ? "inscrição" : "inscrições"}${props.truncated ? ` · mostrando as ${rows.length} mais recentes` : ""}`}
          </p>

          {rows.length > 0 && (
            <DataTable
              caption="Inscrições do projeto"
              rows={rows}
              rowKey={(r) => r.id}
              columns={[
                ...(canEdit
                  ? [
                      {
                        key: "sel",
                        header: (
                          <Checkbox
                            checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
                            onCheckedChange={() =>
                              setSelected(allSelected ? new Set() : new Set(visibleIds))
                            }
                            aria-label="Selecionar todas"
                          />
                        ),
                        className: "w-10",
                        mobile: "desktopOnly" as const,
                        cell: (r: RegistrationRow) => (
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={(on) =>
                              setSelected((s) => {
                                const n = new Set(s);
                                if (on) n.add(r.id);
                                else n.delete(r.id);
                                return n;
                              })
                            }
                            aria-label={`Selecionar ${r.name}`}
                          />
                        ),
                      },
                    ]
                  : []),
                {
                  key: "name",
                  header: "Pessoa",
                  mobile: "primary",
                  cell: (r) => (
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="text-fg-subtle block truncate text-sm">
                        {r.companionOf ? `Acompanhante de ${r.companionOf}` : [r.company, r.jobTitle].filter(Boolean).join(" · ") || r.email || "—"}
                      </span>
                    </span>
                  ),
                },
                {
                  key: "cat",
                  header: "Categoria",
                  mobile: "secondary",
                  cell: (r) => (
                    <span className="flex flex-wrap gap-1">
                      {r.category ? <LabelDot label={r.category} /> : <span className="text-fg-faint text-sm">—</span>}
                      {r.group && <LabelDot label={r.group} />}
                    </span>
                  ),
                },
                {
                  key: "code",
                  header: "Código",
                  mobile: "desktopOnly",
                  cell: (r) => <span className="tabular text-fg-muted font-mono text-sm">{r.shortCode}</span>,
                },
                {
                  key: "status",
                  header: "Status",
                  mobile: "meta",
                  cell: (r) => (
                    <span className="flex items-center gap-1.5">
                      <Badge tone={STATUS[r.status].tone} dot size="sm">
                        {STATUS[r.status].label}
                      </Badge>
                      {r.checkedIn && (
                        <Badge tone="brand" size="sm">
                          Credenciado
                        </Badge>
                      )}
                    </span>
                  ),
                },
                ...(canEdit
                  ? [
                      {
                        key: "actions",
                        header: <span className="sr-only">Ações</span>,
                        className: "w-12",
                        align: "right" as const,
                        mobile: "meta" as const,
                        cell: (r: RegistrationRow) => (
                          <RowMenu
                            row={r}
                            categories={categories}
                            onPatch={(data, done) => patch([r.id], data, done)}
                          />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          )}
        </>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
          <div className="border-border bg-surface flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 shadow-lg">
            <span className="tabular px-1 text-sm font-medium">{selected.size} selecionadas</span>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => patch([...selected], { status: "CONFIRMED" }, "{n} confirmadas.")}>
              Confirmar
            </Button>
            {categories.length > 0 && (
              <Menu>
                <MenuTrigger asChild>
                  <Button size="sm" variant="secondary" disabled={pending}>
                    Categoria
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  {categories.map((c) => (
                    <MenuItem key={c.id} onSelect={() => patch([...selected], { categoryId: c.id }, `{n} movidas para ${c.name}.`)}>
                      <span className="size-2 rounded-full" style={{ background: c.color }} /> {c.name}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            )}
            {groups.length > 0 && (
              <Menu>
                <MenuTrigger asChild>
                  <Button size="sm" variant="secondary" disabled={pending}>
                    Grupo
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  {groups.map((g) => (
                    <MenuItem key={g.id} onSelect={() => patch([...selected], { groupId: g.id }, `{n} no grupo ${g.name}.`)}>
                      <span className="size-2 rounded-full" style={{ background: g.color }} /> {g.name}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            )}
            <Button size="sm" variant="danger-ghost" disabled={pending} onClick={() => patch([...selected], { status: "CANCELED" }, "{n} canceladas.")}>
              Cancelar
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setSelected(new Set())} aria-label="Limpar seleção">
              <X />
            </Button>
          </div>
        </div>
      )}

      {props.truncated && (
        <Notice tone="info" className="mt-4">
          Use a busca ou os filtros para encontrar inscrições além das {rows.length} mais recentes.
        </Notice>
      )}

      <AddRegistrationSheet
        open={adding}
        onOpenChange={setAdding}
        tenant={tenant}
        projectId={projectId}
        categories={categories}
        groups={groups}
      />
      <ImportSheet
        open={importing}
        onOpenChange={setImporting}
        tenant={tenant}
        projectId={projectId}
        categories={categories}
      />
    </>
  );
}

function RowMenu({
  row,
  categories,
  onPatch,
}: {
  row: RegistrationRow;
  categories: Label[];
  onPatch: (data: { status?: Status; categoryId?: string | null }, done: string) => void;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Ações de ${row.name}`}>
          <MoreHorizontal />
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>Status</MenuLabel>
        {(["CONFIRMED", "PENDING", "WAITLIST", "DECLINED"] as const)
          .filter((s) => s !== row.status)
          .map((s) => (
            <MenuItem key={s} onSelect={() => onPatch({ status: s }, `${row.name}: ${STATUS[s].label.toLowerCase()}.`)}>
              {STATUS[s].label}
            </MenuItem>
          ))}
        {categories.length > 0 && (
          <>
            <MenuSeparator />
            <MenuLabel>Categoria</MenuLabel>
            {categories
              .filter((c) => c.id !== row.category?.id)
              .map((c) => (
                <MenuItem key={c.id} onSelect={() => onPatch({ categoryId: c.id }, `${row.name} agora é ${c.name}.`)}>
                  <span className="size-2 rounded-full" style={{ background: c.color }} /> {c.name}
                </MenuItem>
              ))}
          </>
        )}
        {row.status !== "CANCELED" && (
          <>
            <MenuSeparator />
            <MenuItem tone="danger" onSelect={() => onPatch({ status: "CANCELED" }, `Inscrição de ${row.name} cancelada.`)}>
              Cancelar inscrição
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
