"use client";

import {
  BedDouble,
  Building2,
  Download,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Printer,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  foldText,
  ROOM_TYPE_LABEL,
  ROOM_TYPE_OPTIONS,
  roomCapacity,
  type RoomType,
} from "@mais/core";
import { Badge, Button, EmptyState, Input, Panel, PanelHeader } from "@/components/ui";
import { Checkbox, Select } from "@/components/ui/controls";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import { Dot, SectionTitle, TextField, useRunAction } from "@/components/travel/kit";
import type { TravelerOption } from "@/server/travel";
import { deleteAccommodation, deleteRoom, saveAccommodation, saveRoom } from "./actions";

type Room = {
  id: string;
  number: string;
  type: RoomType;
  typeLabel: string;
  checkIn: string;
  checkOut: string;
  confirmation: string;
  notes: string;
  occupants: string[];
};

export type HotelData = {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  notes: string;
  overCapacity: string[];
  rooms: Room[];
};

const fmtDay = (d: string) =>
  d
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
        .format(new Date(`${d}T12:00:00Z`))
        .replace(".", "")
    : "—";

export function HotelsManager({
  tenant,
  projectId,
  canEdit,
  hotels,
  travelers,
  reportHref,
  xlsxHref,
}: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  hotels: HotelData[];
  travelers: TravelerOption[];
  reportHref: string;
  xlsxHref: string;
}) {
  const [hotelEdit, setHotelEdit] = useState<HotelData | "new" | null>(null);
  const [roomEdit, setRoomEdit] = useState<{ hotel: HotelData; room: Room | null } | null>(null);
  const names = useMemo(() => new Map(travelers.map((t) => [t.id, t])), [travelers]);

  const housed = new Set(hotels.flatMap((h) => h.rooms.flatMap((r) => r.occupants)));
  const unhoused = travelers.filter((t) => !housed.has(t.id));

  if (!hotels.length)
    return (
      <>
        <EmptyState
          icon={<Building2 />}
          title="Cadastre o hotel do grupo"
          description="Depois monte o rooming: quartos, tipos e quem fica com quem — inclusive quartos compartilhados."
          action={
            canEdit && (
              <Button onClick={() => setHotelEdit("new")}>
                <Plus /> Novo hotel
              </Button>
            )
          }
        />
        {hotelEdit && (
          <HotelSheet
            tenant={tenant}
            projectId={projectId}
            hotel={null}
            onClose={() => setHotelEdit(null)}
          />
        )}
      </>
    );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>
              <strong className="text-fg tabular">{housed.size}</strong> de {travelers.length}{" "}
              hospedados
            </span>
            {unhoused.length > 0 && (
              <Badge tone="warning" dot>
                {unhoused.length} sem quarto
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <a href={xlsxHref}>
                <Download /> Rooming (XLSX)
              </a>
            </Button>
            <Button variant="secondary" asChild>
              <a href={reportHref} target="_blank" rel="noreferrer">
                <Printer /> Imprimir
              </a>
            </Button>
            {canEdit && (
              <Button onClick={() => setHotelEdit("new")}>
                <Plus /> Novo hotel
              </Button>
            )}
          </div>
        </div>

        {hotels.map((h) => (
          <Panel key={h.id}>
            <PanelHeader
              title={h.name}
              description={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {h.city && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {[h.city, h.country].filter(Boolean).join(", ")}
                    </span>
                  )}
                  <span className="tabular">
                    {fmtDay(h.checkIn)} → {fmtDay(h.checkOut)}
                    {h.nights ? ` · ${h.nights} noite${h.nights === 1 ? "" : "s"}` : ""}
                  </span>
                  {h.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3.5" />
                      {h.phone}
                    </span>
                  )}
                </span>
              }
              actions={
                canEdit && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRoomEdit({ hotel: h, room: null })}
                    >
                      <Plus /> Quarto
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Editar hotel"
                      onClick={() => setHotelEdit(h)}
                    >
                      <Pencil />
                    </Button>
                  </div>
                )
              }
            />
            {h.rooms.length === 0 ? (
              <p className="text-fg-subtle px-5 py-6 text-sm">
                Nenhum quarto ainda. Adicione os quartos conforme a confirmação do hotel — o número
                pode ficar em branco até o check-in.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {h.rooms.map((r) => {
                  const over = h.overCapacity.includes(r.id);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setRoomEdit({ hotel: h, room: r })}
                        className="hover:bg-hover flex w-full flex-col gap-2 px-5 py-3 text-left disabled:cursor-default disabled:hover:bg-transparent md:flex-row md:items-center"
                      >
                        <div className="flex items-center gap-3 md:w-56">
                          <span className="bg-surface-muted border-border grid size-9 shrink-0 place-items-center rounded-sm border font-mono text-sm font-semibold">
                            {r.number || "—"}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{ROOM_TYPE_LABEL[r.type]}</div>
                            <div className="text-fg-subtle truncate text-xs">
                              {r.typeLabel || (r.confirmation ? `Conf. ${r.confirmation}` : "")}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-1 flex-wrap gap-1.5">
                          {r.occupants.length === 0 ? (
                            <span className="text-fg-faint text-sm">Vazio</span>
                          ) : (
                            r.occupants.map((id) => {
                              const t = names.get(id);
                              return (
                                <Badge key={id} className="gap-1.5">
                                  {t?.group && <Dot color={t.group.color} />}
                                  {t?.name ?? "—"}
                                </Badge>
                              );
                            })
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {over && (
                            <Badge tone="danger">
                              <TriangleAlert className="size-3" /> Acima da capacidade
                            </Badge>
                          )}
                          {(r.checkIn || r.checkOut) && (
                            <span className="text-fg-subtle tabular text-xs">
                              {fmtDay(r.checkIn || h.checkIn)} → {fmtDay(r.checkOut || h.checkOut)}
                            </span>
                          )}
                          <span className="text-fg-subtle tabular text-xs">
                            {r.occupants.length}/{roomCapacity(r.type)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        ))}
      </div>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <SectionTitle>Sem quarto</SectionTitle>
        <Panel>
          {unhoused.length === 0 ? (
            <p className="text-fg-subtle p-5 text-sm">Todos os inscritos estão hospedados.</p>
          ) : (
            <ul className="divide-border max-h-[60vh] divide-y overflow-y-auto">
              {unhoused.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  {t.group && <Dot color={t.group.color} />}
                  <span className="truncate">{t.name}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </aside>

      {hotelEdit && (
        <HotelSheet
          tenant={tenant}
          projectId={projectId}
          hotel={hotelEdit === "new" ? null : hotelEdit}
          onClose={() => setHotelEdit(null)}
        />
      )}
      {roomEdit && (
        <RoomSheet
          key={roomEdit.room?.id ?? "new"}
          tenant={tenant}
          projectId={projectId}
          hotel={roomEdit.hotel}
          room={roomEdit.room}
          travelers={travelers}
          busy={
            new Set(
              roomEdit.hotel.rooms
                .filter((r) => r.id !== roomEdit.room?.id)
                .flatMap((r) => r.occupants),
            )
          }
          onClose={() => setRoomEdit(null)}
        />
      )}
    </div>
  );
}

function HotelSheet({
  tenant,
  projectId,
  hotel,
  onClose,
}: {
  tenant: string;
  projectId: string;
  hotel: HotelData | null;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    name: hotel?.name ?? "",
    address: hotel?.address ?? "",
    city: hotel?.city ?? "",
    country: hotel?.country ?? "",
    phone: hotel?.phone ?? "",
    checkIn: hotel?.checkIn ?? "",
    checkOut: hotel?.checkOut ?? "",
    notes: hotel?.notes ?? "",
  });
  const [del, setDel] = useState(false);
  const { run, pending, errors } = useRunAction();
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={hotel ? hotel.name : "Novo hotel"}
      footer={
        <>
          {hotel && (
            <Button variant="danger-ghost" className="md:mr-auto" onClick={() => setDel(true)}>
              <Trash2 /> Excluir
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              run(() => saveAccommodation({ tenant, projectId, id: hotel?.id ?? null, ...f }), {
                success: "Hotel salvo.",
                onSuccess: onClose,
              })
            }
          >
            Salvar hotel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Nome do hotel"
          value={f.name}
          onChange={set("name")}
          error={errors.name}
        />
        <TextField label="Endereço" optional value={f.address} onChange={set("address")} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Cidade" optional value={f.city} onChange={set("city")} />
          <TextField label="País" optional value={f.country} onChange={set("country")} />
        </div>
        <TextField label="Telefone" optional value={f.phone} onChange={set("phone")} type="tel" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Check-in" type="date" value={f.checkIn} onChange={set("checkIn")} />
          <TextField
            label="Check-out"
            type="date"
            value={f.checkOut}
            onChange={set("checkOut")}
            error={errors.checkOut}
          />
        </div>
        <TextField label="Observações" optional multiline value={f.notes} onChange={set("notes")} />
      </div>
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        tone="danger"
        title={`Excluir ${hotel?.name}?`}
        description="Os quartos e o rooming deste hotel serão apagados."
        confirmLabel="Excluir hotel"
        loading={pending}
        onConfirm={() =>
          run(() => deleteAccommodation({ tenant, projectId, id: hotel!.id }), {
            success: "Hotel excluído.",
            onSuccess: onClose,
          })
        }
      />
    </Sheet>
  );
}

function RoomSheet({
  tenant,
  projectId,
  hotel,
  room,
  travelers,
  busy,
  onClose,
}: {
  tenant: string;
  projectId: string;
  hotel: HotelData;
  room: Room | null;
  travelers: TravelerOption[];
  busy: Set<string>;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    number: room?.number ?? "",
    type: (room?.type ?? "DOUBLE") as RoomType,
    typeLabel: room?.typeLabel ?? "",
    checkIn: room?.checkIn ?? "",
    checkOut: room?.checkOut ?? "",
    confirmation: room?.confirmation ?? "",
    notes: room?.notes ?? "",
  });
  const [occ, setOcc] = useState<string[]>(room?.occupants ?? []);
  const [q, setQ] = useState("");
  const [del, setDel] = useState(false);
  const { run, pending, errors } = useRunAction();
  const cap = roomCapacity(f.type);
  const list = travelers.filter((t) => !q || foldText(t.name).includes(foldText(q)));
  // Quem está sem quarto aparece primeiro
  list.sort((a, b) => Number(busy.has(a.id)) - Number(busy.has(b.id)));
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  return (
    <Sheet
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={room ? `Quarto ${room.number || "sem número"}` : "Novo quarto"}
      description={hotel.name}
      footer={
        <>
          {room && (
            <Button variant="danger-ghost" className="md:mr-auto" onClick={() => setDel(true)}>
              <Trash2 /> Excluir
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              run(
                () =>
                  saveRoom({
                    tenant,
                    projectId,
                    accommodationId: hotel.id,
                    id: room?.id ?? null,
                    ...f,
                    occupants: occ,
                  }),
                { success: "Quarto salvo.", onSuccess: onClose },
              )
            }
          >
            Salvar quarto
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3">
          <TextField label="Número" optional value={f.number} onChange={set("number")} />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Tipo</span>
            <Select
              value={f.type}
              onValueChange={(v) => setF((s) => ({ ...s, type: v as RoomType }))}
              options={ROOM_TYPE_OPTIONS.map((t) => ({
                value: t.value,
                label: `${t.label} · até ${t.capacity}`,
              }))}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Descrição do hotel"
            optional
            value={f.typeLabel}
            onChange={set("typeLabel")}
            placeholder="Deluxe vista mar"
          />
          <TextField
            label="Confirmação"
            optional
            value={f.confirmation}
            onChange={set("confirmation")}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Check-in"
            optional
            type="date"
            value={f.checkIn}
            onChange={set("checkIn")}
            hint="Só se for diferente do hotel"
          />
          <TextField
            label="Check-out"
            optional
            type="date"
            value={f.checkOut}
            onChange={set("checkOut")}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Ocupantes</span>
            <span className={occ.length > cap ? "text-danger text-sm" : "text-fg-subtle text-sm"}>
              <BedDouble className="mr-1 inline size-3.5" />
              {occ.length}/{cap}
            </span>
          </div>
          <div className="relative mb-2">
            <Search className="text-fg-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              aria-label="Buscar pessoa"
              className="pl-9"
              placeholder="Buscar pelo nome"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <ul className="divide-border border-border max-h-72 divide-y overflow-y-auto rounded-md border">
            {list.map((t) => {
              const on = occ.includes(t.id);
              return (
                <li key={t.id}>
                  <label className="hover:bg-hover flex cursor-pointer items-center gap-3 px-3 py-2">
                    <Checkbox
                      checked={on}
                      onCheckedChange={(c) =>
                        setOcc((o) => (c === true ? [...o, t.id] : o.filter((x) => x !== t.id)))
                      }
                    />
                    {t.group && <Dot color={t.group.color} />}
                    <span className="flex-1 truncate text-sm">{t.name}</span>
                    {busy.has(t.id) && !on && (
                      <span className="text-fg-faint text-xs">em outro quarto</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
          {errors.occupants && <p className="text-danger mt-1 text-xs">{errors.occupants}</p>}
        </div>
        <TextField label="Observações" optional multiline value={f.notes} onChange={set("notes")} />
      </div>
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        tone="danger"
        title="Excluir este quarto?"
        description="Os ocupantes voltam para a lista de quem está sem quarto."
        confirmLabel="Excluir quarto"
        loading={pending}
        onConfirm={() =>
          run(() => deleteRoom({ tenant, projectId, id: room!.id }), {
            success: "Quarto excluído.",
            onSuccess: onClose,
          })
        }
      />
    </Sheet>
  );
}
