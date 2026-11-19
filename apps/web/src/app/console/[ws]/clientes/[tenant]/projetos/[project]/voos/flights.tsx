"use client";

import { Pencil, Plane, Plus, RefreshCw, Search, Trash2, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { foldText } from "@mais/core";
import { Badge, Button, EmptyState, Input, Panel } from "@/components/ui";
import { Checkbox, Select } from "@/components/ui/controls";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlightRoute, type FlightView } from "@/components/travel/flight-route";
import { Dot, SectionTitle, TextField, useRunAction } from "@/components/travel/kit";
import type { TravelerOption } from "@/server/travel";
import { deleteFlight, refreshFlightStatus, saveFlight, setFlightPassengers } from "./actions";

type Locator = { id: string | null; code: string; notes: string };
type EditData = {
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  operatedBy: string;
  originIata: string;
  destIata: string;
  departureLocal: string;
  arrivalLocal: string;
  notes: string;
  locators: Locator[];
};
type Pax = { registrationId: string; locatorId: string | null; seat: string; ticketNumber: string };

export type FlightRowData = { view: FlightView; edit: EditData; passengers: Pax[] };

const EMPTY: EditData = {
  airlineCode: "",
  airlineName: "",
  flightNumber: "",
  operatedBy: "",
  originIata: "",
  destIata: "",
  departureLocal: "",
  arrivalLocal: "",
  notes: "",
  locators: [],
};

export function FlightsManager({
  tenant,
  projectId,
  canEdit,
  liveEnabled,
  flights,
  travelers,
  airlines,
  airports,
}: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  liveEnabled: boolean;
  flights: FlightRowData[];
  travelers: TravelerOption[];
  airlines: { code: string; name: string }[];
  airports: { iata: string; label: string }[];
}) {
  const [editing, setEditing] = useState<{ id: string | null; data: EditData } | null>(null);
  const [paxFor, setPaxFor] = useState<FlightRowData | null>(null);
  const { run, pending } = useRunAction();

  // Agrupa por dia de partida (no fuso da origem)
  const groups = useMemo(() => {
    const m = new Map<string, FlightRowData[]>();
    for (const f of flights) {
      const k = f.view.depDate || "Sem data";
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    return [...m];
  }, [flights]);

  const withoutFlight = travelers.filter(
    (t) => !flights.some((f) => f.passengers.some((x) => x.registrationId === t.id)),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <datalist id="airlines-list">
        {airlines.map((a) => (
          <option key={a.code} value={a.code}>
            {a.name}
          </option>
        ))}
      </datalist>
      <datalist id="airports-list">
        {airports.map((a) => (
          <option key={a.iata} value={a.iata}>
            {a.label}
          </option>
        ))}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span>
            <strong className="text-fg tabular">{flights.length}</strong> voo
            {flights.length === 1 ? "" : "s"}
          </span>
          <span>
            <strong className="text-fg tabular">{travelers.length - withoutFlight}</strong> de{" "}
            {travelers.length} pessoas com voo
          </span>
          {withoutFlight > 0 && (
            <Badge tone="warning" dot>
              {withoutFlight} sem voo
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {liveEnabled && flights.length > 0 && (
            <Button
              variant="secondary"
              loading={pending}
              onClick={() =>
                run(() => refreshFlightStatus({ tenant, projectId }), {
                  success: "Atualização pedida. O status aparece em instantes.",
                })
              }
            >
              <RefreshCw /> Atualizar status
            </Button>
          )}
          {canEdit && (
            <Button onClick={() => setEditing({ id: null, data: EMPTY })}>
              <Plus /> Novo voo
            </Button>
          )}
        </div>
      </div>

      {flights.length === 0 ? (
        <EmptyState
          icon={<Plane />}
          title="Cadastre o primeiro voo do grupo"
          description="Informe número, trecho e horários locais do bilhete. Depois aloque os passageiros com localizador e assento."
          action={
            canEdit && (
              <Button onClick={() => setEditing({ id: null, data: EMPTY })}>
                <Plus /> Novo voo
              </Button>
            )
          }
        />
      ) : (
        <Tabs defaultValue="flights">
          <TabsList>
            <TabsTrigger value="flights">Voos</TabsTrigger>
            <TabsTrigger value="people">Por passageiro</TabsTrigger>
          </TabsList>
          <TabsContent value="flights" className="mt-5 flex flex-col gap-8">
            {groups.map(([day, list]) => (
              <section key={day}>
                <SectionTitle>
                  <span className="capitalize">{day}</span>
                </SectionTitle>
                <div className="grid gap-3 lg:grid-cols-2">
                  {list.map((f) => (
                    <FlightCard
                      key={f.view.id}
                      flight={f}
                      canEdit={canEdit}
                      onEdit={() => setEditing({ id: f.view.id, data: f.edit })}
                      onPassengers={() => setPaxFor(f)}
                    />
                  ))}
                </div>
              </section>
            ))}
            {!liveEnabled && (
              <p className="text-fg-subtle text-sm">
                O status ao vivo (atrasos, portão, pouso) fica disponível quando a integração de
                status de voo estiver configurada.
              </p>
            )}
          </TabsContent>
          <TabsContent value="people" className="mt-5">
            <ByPassenger flights={flights} travelers={travelers} />
          </TabsContent>
        </Tabs>
      )}

      {editing && (
        <FlightSheet
          key={editing.id ?? "new"}
          tenant={tenant}
          projectId={projectId}
          flightId={editing.id}
          initial={editing.data}
          onClose={() => setEditing(null)}
        />
      )}
      {paxFor && (
        <PassengersSheet
          key={paxFor.view.id}
          tenant={tenant}
          projectId={projectId}
          flight={paxFor}
          travelers={travelers}
          onClose={() => setPaxFor(null)}
        />
      )}
    </div>
  );
}

function FlightCard({
  flight,
  canEdit,
  onEdit,
  onPassengers,
}: {
  flight: FlightRowData;
  canEdit: boolean;
  onEdit: () => void;
  onPassengers: () => void;
}) {
  const n = flight.passengers.length;
  return (
    <Panel className="flex flex-col">
      <div className="p-5">
        <FlightRoute flight={flight.view} />
      </div>
      <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-fg-muted mr-1 inline-flex items-center gap-1.5 text-sm">
            <Users className="size-3.5" />
            <span className="tabular">{n}</span> passageiro{n === 1 ? "" : "s"}
          </span>
          {flight.edit.locators.slice(0, 4).map((l) => (
            <Badge key={l.id ?? l.code} size="sm" className="font-mono">
              {l.code}
            </Badge>
          ))}
          {flight.edit.locators.length > 4 && (
            <Badge size="sm">+{flight.edit.locators.length - 4}</Badge>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={onPassengers}>
              <Users /> Passageiros
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Editar voo" onClick={onEdit}>
              <Pencil />
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

function FlightSheet({
  tenant,
  projectId,
  flightId,
  initial,
  onClose,
}: {
  tenant: string;
  projectId: string;
  flightId: string | null;
  initial: EditData;
  onClose: () => void;
}) {
  const [f, setF] = useState<EditData>(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { run, pending, errors } = useRunAction();
  const set =
    <K extends keyof EditData>(k: K) =>
    (v: EditData[K]) =>
      setF((s) => ({ ...s, [k]: v }));

  const save = () =>
    run(() => saveFlight({ tenant, projectId, flightId, ...f }), {
      success: flightId ? "Voo atualizado." : "Voo cadastrado.",
      onSuccess: onClose,
    });

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={flightId ? `Voo ${initial.flightNumber}` : "Novo voo"}
      description="Horários locais do bilhete: partida no fuso da origem, chegada no do destino."
      footer={
        <>
          {flightId && (
            <Button
              variant="danger-ghost"
              className="md:mr-auto"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 /> Excluir
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={pending} onClick={save}>
            Salvar voo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
          <TextField
            label="Companhia"
            value={f.airlineCode}
            onChange={(v) => set("airlineCode")(v.toUpperCase())}
            placeholder="LA"
            maxLength={3}
            inputClassName="font-mono uppercase"
            list="airlines-list"
          />
          <TextField
            label="Número do voo"
            value={f.flightNumber}
            onChange={(v) => set("flightNumber")(v.toUpperCase())}
            error={errors.flightNumber}
            placeholder="LA8084"
            inputClassName="font-mono uppercase"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Origem"
            value={f.originIata}
            onChange={(v) => set("originIata")(v.toUpperCase())}
            error={errors.originIata}
            placeholder="GRU"
            maxLength={3}
            inputClassName="font-mono uppercase"
            list="airports-list"
          />
          <TextField
            label="Destino"
            value={f.destIata}
            onChange={(v) => set("destIata")(v.toUpperCase())}
            error={errors.destIata}
            placeholder="LIS"
            maxLength={3}
            inputClassName="font-mono uppercase"
            list="airports-list"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Partida (hora local)"
            type="datetime-local"
            value={f.departureLocal}
            onChange={set("departureLocal")}
            error={errors.departureLocal}
          />
          <TextField
            label="Chegada (hora local)"
            type="datetime-local"
            value={f.arrivalLocal}
            onChange={set("arrivalLocal")}
            error={errors.arrivalLocal}
          />
        </div>
        <TextField
          label="Operado por"
          optional
          value={f.operatedBy}
          onChange={set("operatedBy")}
          placeholder="Quando a operadora difere da companhia vendedora"
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Localizadores</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => set("locators")([...f.locators, { id: null, code: "", notes: "" }])}
            >
              <Plus /> Adicionar
            </Button>
          </div>
          {f.locators.length === 0 ? (
            <p className="text-fg-subtle text-sm">
              Um voo costuma ter vários localizadores (um por bloco ou emissão). Adicione-os para
              alocar cada passageiro ao seu.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {f.locators.map((l, i) => (
                <div key={i} className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2">
                  <Input
                    aria-label="Código do localizador"
                    value={l.code}
                    className="font-mono uppercase"
                    placeholder="XK7P2M"
                    onChange={(e) =>
                      set("locators")(
                        f.locators.map((x, j) =>
                          j === i ? { ...x, code: e.target.value.toUpperCase() } : x,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label="Observação do localizador"
                    value={l.notes}
                    placeholder="Ex.: bloco diretoria"
                    onChange={(e) =>
                      set("locators")(
                        f.locators.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover localizador"
                    onClick={() => set("locators")(f.locators.filter((_, j) => j !== i))}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {errors.locators && <p className="text-danger mt-1 text-xs">{errors.locators}</p>}
        </div>
        <TextField label="Observações" optional multiline value={f.notes} onChange={set("notes")} />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        title={`Excluir o voo ${initial.flightNumber}?`}
        description="Os passageiros alocados neste voo deixam de vê-lo no portal. Esta ação não pode ser desfeita."
        confirmLabel="Excluir voo"
        loading={pending}
        onConfirm={() =>
          run(() => deleteFlight({ tenant, projectId, flightId: flightId! }), {
            success: "Voo excluído.",
            onSuccess: onClose,
          })
        }
      />
    </Sheet>
  );
}

function PassengersSheet({
  tenant,
  projectId,
  flight,
  travelers,
  onClose,
}: {
  tenant: string;
  projectId: string;
  flight: FlightRowData;
  travelers: TravelerOption[];
  onClose: () => void;
}) {
  const [sel, setSel] = useState<Map<string, Pax>>(
    () => new Map(flight.passengers.map((x) => [x.registrationId, x])),
  );
  const [q, setQ] = useState("");
  const { run, pending, errors } = useRunAction();
  const locators = flight.edit.locators.filter((l) => l.id);
  const visible = travelers.filter((t) => !q || foldText(t.name).includes(foldText(q)));

  const toggle = (id: string, on: boolean) =>
    setSel((m) => {
      const n = new Map(m);
      if (on)
        n.set(id, {
          registrationId: id,
          locatorId: locators[0]?.id ?? null,
          seat: "",
          ticketNumber: "",
        });
      else n.delete(id);
      return n;
    });
  const patch = (id: string, p: Partial<Pax>) =>
    setSel((m) => {
      const n = new Map(m);
      const cur = n.get(id);
      if (cur) n.set(id, { ...cur, ...p });
      return n;
    });
  const allVisible = visible.length > 0 && visible.every((t) => sel.has(t.id));

  return (
    <Sheet
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={`Passageiros · ${flight.view.flightNumber} ${flight.view.originIata}→${flight.view.destIata}`}
      description={`${sel.size} selecionado${sel.size === 1 ? "" : "s"} de ${travelers.length}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              run(
                () =>
                  setFlightPassengers({
                    tenant,
                    projectId,
                    flightId: flight.view.id,
                    passengers: [...sel.values()],
                  }),
                { success: "Passageiros do voo salvos.", onSuccess: onClose },
              )
            }
          >
            Salvar alocação
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="text-fg-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              aria-label="Buscar pessoa"
              className="pl-9"
              placeholder="Buscar pelo nome"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => visible.forEach((t) => toggle(t.id, !allVisible))}
          >
            {allVisible ? "Desmarcar" : "Marcar"} {q ? "filtrados" : "todos"}
          </Button>
        </div>
        {errors.passengers && <p className="text-danger text-xs">{errors.passengers}</p>}
        <ul className="divide-border border-border divide-y rounded-md border">
          {visible.map((t) => {
            const x = sel.get(t.id);
            return (
              <li
                key={t.id}
                className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center"
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <Checkbox checked={!!x} onCheckedChange={(c) => toggle(t.id, c === true)} />
                  <span className="min-w-0 truncate text-base">{t.name}</span>
                  {t.group && <Dot color={t.group.color} />}
                </label>
                {x && (
                  <div className="grid grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] gap-2 pl-7 sm:w-[360px] sm:pl-0">
                    <Select
                      aria-describedby={undefined}
                      value={x.locatorId ?? "none"}
                      onValueChange={(v) => patch(t.id, { locatorId: v === "none" ? null : v })}
                      options={[
                        { value: "none", label: "Sem localizador" },
                        ...locators.map((l) => ({ value: l.id!, label: l.code })),
                      ]}
                    />
                    <Input
                      aria-label="Assento"
                      placeholder="Assento"
                      value={x.seat}
                      className="uppercase"
                      onChange={(e) => patch(t.id, { seat: e.target.value.toUpperCase() })}
                    />
                    <Input
                      aria-label="Bilhete"
                      placeholder="Bilhete"
                      value={x.ticketNumber}
                      onChange={(e) => patch(t.id, { ticketNumber: e.target.value })}
                    />
                  </div>
                )}
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="text-fg-subtle px-3 py-6 text-center text-sm">
              {travelers.length ? "Ninguém com esse nome." : "O projeto ainda não tem inscritos."}
            </li>
          )}
        </ul>
      </div>
    </Sheet>
  );
}

function ByPassenger({
  flights,
  travelers,
}: {
  flights: FlightRowData[];
  travelers: TravelerOption[];
}) {
  const [q, setQ] = useState("");
  const rows = travelers
    .filter((t) => !q || foldText(t.name).includes(foldText(q)))
    .map((t) => ({
      t,
      legs: flights
        .map((f) => ({ f, x: f.passengers.find((p) => p.registrationId === t.id) }))
        .filter((l) => l.x),
    }));
  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-sm">
        <Search className="text-fg-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          aria-label="Buscar passageiro"
          className="pl-9"
          placeholder="Buscar passageiro"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <Panel>
        <ul className="divide-border divide-y">
          {rows.map(({ t, legs }) => (
            <li key={t.id} className="flex flex-col gap-2 px-5 py-3 md:flex-row md:items-center">
              <div className="flex min-w-0 items-center gap-2 md:w-64">
                {t.group && <Dot color={t.group.color} />}
                <span className="truncate font-medium">{t.name}</span>
              </div>
              <div className="flex flex-1 flex-wrap gap-1.5">
                {legs.length === 0 ? (
                  <Badge tone="warning" dot>
                    Sem voo
                  </Badge>
                ) : (
                  legs.map(({ f, x }) => {
                    const loc = f.edit.locators.find((l) => l.id === x!.locatorId);
                    return (
                      <Badge key={f.view.id} className="font-mono">
                        {f.view.flightNumber} {f.view.originIata}→{f.view.destIata}
                        {loc ? ` · ${loc.code}` : ""}
                        {x!.seat ? ` · ${x!.seat}` : ""}
                      </Badge>
                    );
                  })
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
