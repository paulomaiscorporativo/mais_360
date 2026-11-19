"use client";

import {
  Armchair,
  Circle,
  LayoutGrid,
  Plus,
  RectangleHorizontal,
  Trash2,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { foldText, seatPositions } from "@mais/core";
import { Badge, Button, EmptyState, Field, Input } from "@/components/ui";
import { Select } from "@/components/ui/controls";
import { ConfirmDialog, Sheet, useIsDesktop } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { assignSeat, createTables, deleteTable, unassignSeat, updateTable } from "./actions";

export type TableLite = {
  id: string;
  number: number;
  name: string;
  capacity: number;
  shape: "ROUND" | "RECTANGULAR";
  x: number;
  y: number;
  rotation: number;
  reservedFor: string;
};
export type GuestLite = {
  id: string;
  name: string;
  company: string;
  status: string;
  tableId: string | null;
  seat: number | null;
};

const ROUND_R = 46;
const RECT = { width: 132, height: 56 };
const SEAT_R = 9;

function geometry(t: TableLite) {
  return t.shape === "ROUND"
    ? { radius: ROUND_R + Math.max(0, t.capacity - 8) * 3, width: 0, height: 0 }
    : { radius: 0, width: Math.max(RECT.width, t.capacity * 18), height: RECT.height };
}

export function TableMap({
  tenant,
  projectId,
  canEdit,
  tables: initialTables,
  guests,
}: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  tables: TableLite[];
  guests: GuestLite[];
}) {
  const router = useRouter();
  const desktop = useIsDesktop();
  const [tables, setTables] = useState(initialTables);
  const [synced, setSynced] = useState(initialTables);
  if (synced !== initialTables) {
    // Dados novos do servidor (após acomodar/editar): adota mantendo a posição local
    setSynced(initialTables);
    setTables(initialTables);
  }
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TableLite | null>(null);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const keyMove = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editable = canEdit && desktop; // no celular o mapa é só leitura

  const byTable = useMemo(() => {
    const m = new Map<string, GuestLite[]>();
    for (const g of guests) if (g.tableId) m.set(g.tableId, [...(m.get(g.tableId) ?? []), g]);
    return m;
  }, [guests]);
  const unseated = guests.filter((g) => !g.tableId);
  const seatsTotal = tables.reduce((s, t) => s + t.capacity, 0);
  const seatedTotal = guests.length - unseated.length;
  const current = tables.find((t) => t.id === selected) ?? null;

  const width = Math.max(1200, ...tables.map((t) => t.x + 180));
  const height = Math.max(720, ...tables.map((t) => t.y + 160));

  function toSvg(e: React.PointerEvent) {
    const s = svg.current!;
    const pt = s.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(s.getScreenCTM()!.inverse());
  }

  function onDown(e: React.PointerEvent, t: TableLite) {
    if (!editable) {
      setSelected(t.id);
      return;
    }
    const p = toSvg(e);
    drag.current = { id: t.id, dx: p.x - t.x, dy: p.y - t.y, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = toSvg(e);
    const x = Math.round(Math.max(60, p.x - d.dx) / 10) * 10; // ímã de 10 px
    const y = Math.round(Math.max(60, p.y - d.dy) / 10) * 10;
    d.moved = true;
    setTables((list) => list.map((t) => (t.id === d.id ? { ...t, x, y } : t)));
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      setSelected(d.id);
      return;
    }
    const t = tables.find((x) => x.id === d.id);
    if (t) savePosition(t);
  }

  function savePosition(t: TableLite) {
    void updateTable({ tenant, projectId, id: t.id, x: t.x, y: t.y }).then(
      (r) => !r.ok && toast.error(r.error),
    );
  }

  /** Teclado: Enter/Espaço abre a mesa; setas movem 10 px (Shift: 50 px). */
  function onKey(e: React.KeyboardEvent, t: TableLite) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelected(t.id);
      return;
    }
    if (e.key === "Escape") {
      setSelected(null);
      return;
    }
    const step = e.shiftKey ? 50 : 10;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d || !editable) return;
    e.preventDefault();
    const moved = {
      ...t,
      x: Math.min(4000, Math.max(60, t.x + d[0])),
      y: Math.min(4000, Math.max(60, t.y + d[1])),
    };
    setTables((list) => list.map((x) => (x.id === t.id ? moved : x)));
    // Grava quando a pessoa para de apertar as setas
    if (keyMove.current) clearTimeout(keyMove.current);
    keyMove.current = setTimeout(() => savePosition(moved), 500);
  }

  function run(p: Promise<{ ok: boolean; error?: string }>, done?: string) {
    start(async () => {
      const r = await p;
      if (r.ok) {
        if (done) toast.success(done);
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível concluir.");
    });
  }

  if (tables.length === 0)
    return (
      <>
        <EmptyState
          icon={<LayoutGrid />}
          title="Monte o salão"
          description="Crie as mesas, arraste para reproduzir o layout do espaço e acomode cada convidado na sua cadeira. A mesa aparece no convite digital."
          action={
            canEdit && (
              <Button onClick={() => setAdding(true)}>
                <Plus /> Criar mesas
              </Button>
            )
          }
        />
        <AddTables open={adding} onOpenChange={setAdding} {...{ tenant, projectId }} />
      </>
    );

  const panel = current && (
    <TablePanel
      key={current.id}
      table={current}
      occupants={byTable.get(current.id) ?? []}
      unseated={unseated}
      canEdit={canEdit}
      pending={pending}
      onSave={(data) =>
        run(updateTable({ tenant, projectId, id: current.id, ...data }), "Mesa atualizada.")
      }
      onAssign={(registrationId, seat) =>
        run(assignSeat({ tenant, projectId, registrationId, tableId: current.id, seat }))
      }
      onUnassign={(registrationId) => run(unassignSeat({ tenant, projectId, registrationId }))}
      onDelete={() => setRemoving(current)}
      onClose={() => setSelected(null)}
    />
  );

  const filteredUnseated = q
    ? unseated.filter((g) => foldText(`${g.name} ${g.company}`).includes(foldText(q)))
    : unseated;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="neutral" size="md">
          <Armchair className="size-3.5" /> {seatedTotal} de {seatsTotal} lugares ocupados
        </Badge>
        <Badge tone={unseated.length ? "warning" : "success"} size="md">
          <Users className="size-3.5" /> {unseated.length} sem mesa
        </Badge>
        <span className="text-fg-subtle hidden text-sm md:inline">
          {editable
            ? "Arraste as mesas; clique para acomodar convidados."
            : "Toque numa mesa para ver quem está nela."}
        </span>
        {canEdit && (
          <Button className="ml-auto" variant="secondary" onClick={() => setAdding(true)}>
            <Plus /> Mesas
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="border-border bg-surface-sunken overflow-auto rounded-lg border">
          <svg
            ref={svg}
            viewBox={`0 0 ${width} ${height}`}
            className="block h-auto w-full min-w-[640px] touch-none select-none"
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
            role="group"
            aria-label={
              editable
                ? "Mapa de mesas do salão. Use Tab para escolher a mesa, Enter para abrir e as setas para mover."
                : "Mapa de mesas do salão. Use Tab para escolher a mesa e Enter para abrir."
            }
          >
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path
                  d="M 20 0 L 0 0 0 20"
                  fill="none"
                  className="stroke-border"
                  strokeWidth="0.6"
                />
              </pattern>
            </defs>
            <rect width={width} height={height} fill="url(#grid)" />
            {tables.map((t) => {
              const occ = byTable.get(t.id) ?? [];
              const bySeat = new Map(occ.filter((o) => o.seat).map((o) => [o.seat, o]));
              const geo = geometry(t);
              const full = occ.length >= t.capacity;
              const active = t.id === selected;
              return (
                <g
                  key={t.id}
                  transform={`translate(${t.x} ${t.y}) rotate(${t.rotation})`}
                  onPointerDown={(e) => onDown(e, t)}
                  onKeyDown={(e) => onKey(e, t)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={active}
                  aria-label={`Mesa ${t.number}${t.name ? `, ${t.name}` : ""}: ${occ.length} de ${t.capacity} lugares ocupados${t.reservedFor ? `, reservada para ${t.reservedFor}` : ""}`}
                  className={cn(
                    "focus-visible:[&>.table-shape]:stroke-brand-ring outline-none focus-visible:[&>.table-shape]:stroke-[4]",
                    editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                  )}
                >
                  <title>
                    {`Mesa ${t.number}${t.name ? ` · ${t.name}` : ""} — ${occ.length}/${t.capacity}\n`}
                    {occ.map((o) => `${o.seat ? `${o.seat}. ` : "• "}${o.name}`).join("\n")}
                  </title>
                  {seatPositions(t.shape, t.capacity, geo).map((s) => (
                    <circle
                      key={s.seat}
                      cx={s.x}
                      cy={s.y}
                      r={SEAT_R}
                      className={cn(
                        "stroke-surface stroke-2",
                        bySeat.has(s.seat) ? "fill-brand" : "fill-border-strong",
                      )}
                    />
                  ))}
                  {t.shape === "ROUND" ? (
                    <circle
                      r={geo.radius}
                      className={cn(
                        "table-shape fill-surface stroke-2 transition-colors",
                        active ? "stroke-brand" : full ? "stroke-success" : "stroke-fg-faint",
                      )}
                    />
                  ) : (
                    <rect
                      x={-geo.width / 2}
                      y={-geo.height / 2}
                      width={geo.width}
                      height={geo.height}
                      rx={8}
                      className={cn(
                        "table-shape fill-surface stroke-2",
                        active ? "stroke-brand" : full ? "stroke-success" : "stroke-fg-faint",
                      )}
                    />
                  )}
                  <text textAnchor="middle" y={-2} className="fill-fg text-[22px] font-semibold">
                    {t.number}
                  </text>
                  <text textAnchor="middle" y={18} className="fill-fg-subtle text-[12px]">
                    {occ.length}/{t.capacity}
                  </text>
                  {t.reservedFor && (
                    <text
                      textAnchor="middle"
                      y={(t.shape === "ROUND" ? geo.radius : geo.height / 2) + 40}
                      className="fill-fg-muted text-[12px]"
                    >
                      {t.reservedFor.slice(0, 22)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="flex flex-col gap-4">
          {desktop && panel ? (
            <div className="border-border bg-surface rounded-lg border p-4">{panel}</div>
          ) : (
            <div className="border-border bg-surface rounded-lg border">
              <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
                <p className="text-sm font-medium">Sem mesa ({unseated.length})</p>
              </div>
              <div className="p-3">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar convidado"
                  aria-label="Buscar convidado sem mesa"
                />
              </div>
              <ul className="divide-border max-h-[420px] divide-y overflow-auto">
                {filteredUnseated.length === 0 && (
                  <li className="text-fg-subtle px-4 py-6 text-center text-sm">
                    {unseated.length ? "Ninguém com esse nome." : "Todos os convidados têm mesa."}
                  </li>
                )}
                {filteredUnseated.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 px-4 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{g.name}</span>
                      <span className="text-fg-subtle block truncate text-xs">
                        {g.company || "—"}
                      </span>
                    </span>
                    {canEdit && (
                      <Select
                        aria-label={`Mesa para ${g.name}`}
                        placeholder="Mesa"
                        className="h-8 w-24 text-sm"
                        value=""
                        onValueChange={(tableId) =>
                          run(
                            assignSeat({
                              tenant,
                              projectId,
                              registrationId: g.id,
                              tableId,
                              seat: null,
                            }),
                          )
                        }
                        options={tables.map((t) => {
                          const n = byTable.get(t.id)?.length ?? 0;
                          return {
                            value: t.id,
                            label: `Mesa ${t.number}`,
                            description: `${n}/${t.capacity}`,
                            disabled: n >= t.capacity,
                          };
                        })}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {!desktop && (
        <Sheet
          open={!!current}
          onOpenChange={(o) => !o && setSelected(null)}
          title={current ? `Mesa ${current.number}` : "Mesa"}
        >
          {panel}
        </Sheet>
      )}

      <AddTables open={adding} onOpenChange={setAdding} {...{ tenant, projectId }} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Excluir a mesa ${removing?.number}?`}
        description="Quem estava nela volta para a lista de convidados sem mesa."
        confirmLabel="Excluir mesa"
        tone="danger"
        loading={pending}
        onConfirm={() => {
          if (!removing) return;
          run(deleteTable({ tenant, projectId, id: removing.id }), "Mesa excluída.");
          setRemoving(null);
          setSelected(null);
        }}
      />
    </>
  );
}

function TablePanel({
  table,
  occupants,
  unseated,
  canEdit,
  pending,
  onSave,
  onAssign,
  onUnassign,
  onDelete,
  onClose,
}: {
  table: TableLite;
  occupants: GuestLite[];
  unseated: GuestLite[];
  canEdit: boolean;
  pending: boolean;
  onSave: (
    d: Partial<Pick<TableLite, "number" | "name" | "capacity" | "shape" | "reservedFor">>,
  ) => void;
  onAssign: (registrationId: string, seat: number | null) => void;
  onUnassign: (registrationId: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    number: String(table.number),
    name: table.name,
    capacity: String(table.capacity),
    reservedFor: table.reservedFor,
  });
  const bySeat = new Map(occupants.filter((o) => o.seat).map((o) => [o.seat!, o]));
  const loose = occupants.filter((o) => !o.seat);
  const dirty =
    f.number !== String(table.number) ||
    f.name !== table.name ||
    f.capacity !== String(table.capacity) ||
    f.reservedFor !== table.reservedFor;

  return (
    <div className="flex flex-col gap-4">
      <div className="hidden items-center gap-2 md:flex">
        <p className="flex-1 text-lg font-semibold">Mesa {table.number}</p>
        <span className="text-fg-subtle tabular text-sm">
          {occupants.length}/{table.capacity}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Fechar a mesa" onClick={onClose}>
          <X />
        </Button>
      </div>
      {canEdit && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Número">
              {(a) => (
                <Input
                  id={a.id}
                  aria-describedby={a.describedBy}
                  type="number"
                  min={1}
                  value={f.number}
                  onChange={(e) => setF({ ...f, number: e.target.value })}
                />
              )}
            </Field>
            <Field label="Lugares">
              {(a) => (
                <Input
                  id={a.id}
                  aria-describedby={a.describedBy}
                  type="number"
                  min={1}
                  value={f.capacity}
                  onChange={(e) => setF({ ...f, capacity: e.target.value })}
                />
              )}
            </Field>
          </div>
          <Field label="Reservada para" optional>
            {(a) => (
              <Input
                id={a.id}
                aria-describedby={a.describedBy}
                value={f.reservedFor}
                placeholder="Diretoria, empresa…"
                onChange={(e) => setF({ ...f, reservedFor: e.target.value })}
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onSave({ shape: table.shape === "ROUND" ? "RECTANGULAR" : "ROUND" })}
            >
              {table.shape === "ROUND" ? <RectangleHorizontal /> : <Circle />}
              {table.shape === "ROUND" ? "Retangular" : "Redonda"}
            </Button>
            {dirty && (
              <Button
                size="sm"
                loading={pending}
                onClick={() =>
                  onSave({
                    number: Number(f.number),
                    name: f.name,
                    capacity: Number(f.capacity),
                    reservedFor: f.reservedFor,
                  })
                }
              >
                Salvar
              </Button>
            )}
          </div>
        </>
      )}

      <ul className="border-border divide-border divide-y rounded-md border">
        {Array.from({ length: table.capacity }, (_, i) => i + 1).map((seat) => {
          const o = bySeat.get(seat);
          return (
            <li key={seat} className="flex min-h-11 items-center gap-2 px-3 py-1.5">
              <span className="tabular bg-surface-sunken text-fg-subtle grid size-6 shrink-0 place-items-center rounded-full text-xs">
                {seat}
              </span>
              {o ? (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{o.name}</span>
                    {o.company && (
                      <span className="text-fg-subtle block truncate text-xs">{o.company}</span>
                    )}
                  </span>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Tirar ${o.name} da mesa`}
                      onClick={() => onUnassign(o.id)}
                    >
                      <UserMinus />
                    </Button>
                  )}
                </>
              ) : canEdit && unseated.length ? (
                <Select
                  aria-label={`Acomodar na cadeira ${seat}`}
                  placeholder="Cadeira livre — acomodar"
                  className="h-8 flex-1 text-sm"
                  value=""
                  onValueChange={(id) => onAssign(id, seat)}
                  options={unseated.map((g) => ({
                    value: g.id,
                    label: g.name,
                    description: g.company || undefined,
                  }))}
                />
              ) : (
                <span className="text-fg-faint text-sm">Livre</span>
              )}
            </li>
          );
        })}
      </ul>
      {loose.length > 0 && (
        <p className="text-fg-subtle text-xs">
          Na mesa sem cadeira definida: {loose.map((l) => l.name).join(", ")}
        </p>
      )}
      {canEdit && (
        <Button variant="danger-ghost" size="sm" className="self-start" onClick={onDelete}>
          <Trash2 /> Excluir mesa
        </Button>
      )}
    </div>
  );
}

function AddTables({
  open,
  onOpenChange,
  tenant,
  projectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenant: string;
  projectId: string;
}) {
  const router = useRouter();
  const [count, setCount] = useState("6");
  const [capacity, setCapacity] = useState("8");
  const [shape, setShape] = useState<"ROUND" | "RECTANGULAR">("ROUND");
  const [pending, start] = useTransition();
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Criar mesas"
      description="Elas entram em grade no mapa; depois é só arrastar para o lugar."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await createTables({
                  tenant,
                  projectId,
                  count: Number(count),
                  capacity: Number(capacity),
                  shape,
                });
                if (r.ok) {
                  toast.success("Mesas criadas.");
                  onOpenChange(false);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            Criar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Quantidade">
            {(a) => (
              <Input
                id={a.id}
                aria-describedby={a.describedBy}
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            )}
          </Field>
          <Field label="Lugares por mesa">
            {(a) => (
              <Input
                id={a.id}
                aria-describedby={a.describedBy}
                type="number"
                min={1}
                max={40}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["ROUND", "Redonda", Circle],
              ["RECTANGULAR", "Retangular", RectangleHorizontal],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setShape(value)}
              aria-pressed={shape === value}
              className={cn(
                "flex flex-col items-center gap-2 rounded-md border p-4 text-sm font-medium transition-colors",
                shape === value
                  ? "border-brand bg-brand-subtle text-brand-subtle-fg"
                  : "border-border hover:bg-hover",
              )}
            >
              <Icon className="size-6" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
