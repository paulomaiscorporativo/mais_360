"use client";

import { ArrowLeftRight, Send, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  MAX_PASSENGERS,
  MAX_SEGMENTS,
  PASSENGER_TYPE_LABELS,
  PASSENGER_TYPES,
  TIME_PREFERENCE_LABELS,
  TIME_PREFERENCES,
  TRAVEL_DOC_LABELS,
  TRAVEL_DOC_TYPES,
  type PassengerType,
  type TimePreference,
  type TravelDocType,
  type TravelRequestInput,
  type TripType,
} from "@mais/core/corporate-travel";
import { CABIN_CLASS_LABELS, CABIN_CLASSES, ROOM_TYPE_LABELS } from "@mais/core";
import { ChoiceCards } from "@/components/communication/choice";
import { TextField } from "@/components/travel/kit";
import { Button, Field, Notice } from "@/components/ui";
import { Checkbox, Select } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { REQUEST_SERVICES, SERVICE_ICON, SERVICE_LABEL, type RequestService } from "./labels";

type Result<T> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type RequesterOption = { id: string; name: string; email: string; company: string };

export type RequestFormSubmit = {
  request: TravelRequestInput;
  requester?:
    { personId: string } | { name: string; email: string; phone: string; company: string };
  sendCopy?: boolean;
};

type Segment = { origin: string; destination: string; date: string; time: TimePreference };
type Passenger = {
  key: string;
  name: string;
  type: PassengerType;
  docType: TravelDocType;
  docNumber: string;
  docExpiry: string;
  birthDate: string;
  nationality: string;
  email: string;
  phone: string;
  loyalty: string;
};

const ROOM_OPTIONS = (["SINGLE", "DOUBLE", "TWIN", "SUITE"] as const).map((v) => ({
  value: v,
  label: ROOM_TYPE_LABELS[v],
}));

const emptySegment = (): Segment => ({ origin: "", destination: "", date: "", time: "ANY" });
let seq = 0;
const newPassenger = (over: Partial<Passenger> = {}): Passenger => ({
  key: `p${++seq}`,
  name: "",
  type: "COMPANION",
  docType: "PASSPORT",
  docNumber: "",
  docExpiry: "",
  birthDate: "",
  nationality: "",
  email: "",
  phone: "",
  loyalty: "",
  ...over,
});

/** Bloco numerado do formulário (generoso na área do associado, compacto no console). */
function Step({
  n,
  title,
  description,
  children,
}: {
  n: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border flex flex-col gap-4 border-t pt-6 first:border-t-0 first:pt-0">
      <header className="flex items-start gap-3">
        <span className="bg-brand-subtle text-brand-subtle-fg tabular grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold">
          {n}
        </span>
        <div>
          <h2 className="text-md font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-fg-subtle mt-0.5 text-sm">{description}</p>}
        </div>
      </header>
      <div className="flex flex-col gap-4 sm:pl-10">{children}</div>
    </section>
  );
}

function PrefSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TimePreference;
  onChange: (v: TimePreference) => void;
}) {
  return (
    <Field label={label}>
      {(a) => (
        <Select
          id={a.id}
          value={value}
          onValueChange={(v) => onChange(v as TimePreference)}
          options={TIME_PREFERENCES.map((t) => ({ value: t, label: TIME_PREFERENCE_LABELS[t] }))}
        />
      )}
    </Field>
  );
}

/**
 * Solicitação de viagem — multitrecho, passageiros, serviços pedidos com
 * detalhes e orçamento. Na área do associado o titular vem preenchido; no
 * console a equipe escolhe (ou cadastra) o solicitante.
 */
export function TravelRequestForm({
  mode,
  holder,
  requesters = [],
  submit,
  doneHref,
}: {
  mode: "member" | "staff";
  holder?: { name: string; email: string; phone: string };
  requesters?: RequesterOption[];
  submit: (input: RequestFormSubmit) => Promise<Result<{ id: string; protocol: string }>>;
  /** Prefixo do detalhe: `${doneHref}/${id}` */
  doneHref: string;
}) {
  const router = useRouter();
  const offset = mode === "staff" ? 1 : 0;
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [tripType, setTripType] = useState<TripType>("ROUND_TRIP");
  const [scope, setScope] = useState<"DOMESTIC" | "INTERNATIONAL">("DOMESTIC");
  const [flexible, setFlexible] = useState(false);
  const [route, setRoute] = useState({
    origin: "",
    destination: "",
    depart: "",
    ret: "",
    departTime: "ANY" as TimePreference,
    returnTime: "ANY" as TimePreference,
  });
  const [legs, setLegs] = useState<Segment[]>([emptySegment(), emptySegment()]);
  const [passengers, setPassengers] = useState<Passenger[]>([
    newPassenger({
      type: "HOLDER",
      name: holder?.name ?? "",
      email: holder?.email ?? "",
      phone: holder?.phone ?? "",
    }),
  ]);
  const [services, setServices] = useState<Set<RequestService>>(new Set(["AIR"]));
  const [air, setAir] = useState({
    cabin: "ECONOMY",
    preferredAirline: "",
    checkedBaggage: true,
    seatPreference: "ANY",
    loyaltyProgram: "",
  });
  const [hotel, setHotel] = useState({
    city: "",
    checkIn: "",
    checkOut: "",
    stars: "ANY",
    rooms: "1",
    roomType: "DOUBLE",
    breakfast: true,
    reference: "",
  });
  const [car, setCar] = useState({ category: "", pickup: "", dropoff: "", extraDriver: false });
  const [notesBy, setNotesBy] = useState<Record<string, string>>({});
  const [eventName, setEventName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState<"BRL" | "USD" | "EUR">("BRL");

  // Console: quem pede
  const [requesterId, setRequesterId] = useState<string>(requesters[0]?.id ?? "NEW");
  const [newRequester, setNewRequester] = useState({ name: "", email: "", phone: "", company: "" });
  const [sendCopy, setSendCopy] = useState(true);

  const err = (k: string) => errors[k];
  const toggle = (s: RequestService) =>
    setServices((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  const setPax = (key: string, patch: Partial<Passenger>) =>
    setPassengers((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  function segments(): TravelRequestInput["segments"] {
    if (tripType === "MULTI_CITY")
      return legs.map((l) => ({
        origin: l.origin,
        destination: l.destination,
        date: l.date,
        timePreference: l.time,
      }));
    const out: TravelRequestInput["segments"] = [
      {
        origin: route.origin,
        destination: route.destination,
        date: route.depart,
        timePreference: route.departTime,
      },
    ];
    if (tripType === "ROUND_TRIP")
      out.push({
        origin: route.destination,
        destination: route.origin,
        date: route.ret,
        timePreference: route.returnTime,
      });
    return out;
  }

  function payload(): RequestFormSubmit {
    const list = [...services];
    const details: Record<string, unknown> = {};
    if (services.has("AIR")) details.AIR = air;
    if (services.has("HOTEL"))
      details.HOTEL = {
        ...hotel,
        rooms: Math.max(1, Number(hotel.rooms) || 1),
        checkIn: hotel.checkIn || undefined,
        checkOut: hotel.checkOut || undefined,
      };
    if (services.has("CAR_RENTAL")) details.CAR_RENTAL = car;
    if (services.has("EVENT_TICKET")) details.EVENT_TICKET = { eventName };
    for (const s of [
      "TRANSFER",
      "CHAUFFEUR",
      "TRAVEL_INSURANCE",
      "CURRENCY_EXCHANGE",
      "VISA",
      "CONNECTIVITY",
    ])
      if (services.has(s as RequestService)) details[s] = { notes: notesBy[s] ?? "" };
    const request: TravelRequestInput = {
      tripType,
      scope,
      flexibleDates: flexible,
      purpose,
      notes,
      budget,
      currency,
      segments: segments(),
      passengers: passengers.map((p) => ({
        name: p.name,
        type: p.type,
        docType: p.docType,
        docNumber: p.docNumber,
        docExpiry: p.docExpiry,
        birthDate: p.birthDate,
        nationality: p.nationality,
        email: p.email,
        phone: p.phone,
        loyalty: p.loyalty,
      })),
      services: list,
      serviceDetails: details,
    };
    if (mode === "member") return { request };
    return {
      request,
      sendCopy,
      requester: requesterId === "NEW" ? newRequester : { personId: requesterId },
    };
  }

  // Erros de trechos chegam com o índice do trecho; no modo ida/volta viram os campos da rota
  function routeErr(i: number, k: string) {
    return err(`segments.${i}.${k}`);
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        setFormError(null);
        start(async () => {
          const r = await submit(payload());
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            setFormError(r.error);
            toast.error(r.error);
            return;
          }
          setErrors({});
          toast.success(`Solicitação ${r.data.protocol} enviada.`);
          router.push(`${doneHref}/${r.data.id}`);
        });
      }}
    >
      {mode === "staff" && (
        <Step n={1} title="Solicitante" description="Quem pede e recebe as opções.">
          <Field label="Pessoa" error={err("requester")}>
            {(a) => (
              <Select
                id={a.id}
                value={requesterId}
                onValueChange={setRequesterId}
                options={[
                  ...requesters.map((r) => ({
                    value: r.id,
                    label: r.name,
                    description: [r.company, r.email].filter(Boolean).join(" · "),
                  })),
                  { value: "NEW", label: "Outra pessoa (cadastrar agora)" },
                ]}
              />
            )}
          </Field>
          {requesterId === "NEW" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Nome completo"
                value={newRequester.name}
                onChange={(v) => setNewRequester((s) => ({ ...s, name: v }))}
                error={err("requester.name")}
              />
              <TextField
                label="Empresa"
                optional
                value={newRequester.company}
                onChange={(v) => setNewRequester((s) => ({ ...s, company: v }))}
              />
              <TextField
                label="E-mail"
                type="email"
                value={newRequester.email}
                onChange={(v) => setNewRequester((s) => ({ ...s, email: v }))}
                error={err("requester.email")}
              />
              <TextField
                label="WhatsApp"
                type="tel"
                inputMode="tel"
                value={newRequester.phone}
                onChange={(v) => setNewRequester((s) => ({ ...s, phone: v }))}
                error={err("requester.phone")}
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={sendCopy} onCheckedChange={(v) => setSendCopy(v === true)} />
            Enviar o comprovante ao solicitante por e-mail e WhatsApp
          </label>
        </Step>
      )}

      <Step n={1 + offset} title="Roteiro" description="Para onde e quando.">
        <ChoiceCards
          label="Tipo de viagem"
          value={tripType}
          onChange={setTripType}
          columns={3}
          options={[
            { value: "ONE_WAY", title: "Só ida" },
            { value: "ROUND_TRIP", title: "Ida e volta" },
            { value: "MULTI_CITY", title: "Multitrecho" },
          ]}
        />
        <ChoiceCards
          label="Abrangência"
          value={scope}
          onChange={setScope}
          columns={2}
          options={[
            { value: "DOMESTIC", title: "Nacional" },
            { value: "INTERNATIONAL", title: "Internacional" },
          ]}
        />

        {tripType !== "MULTI_CITY" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Saindo de"
              placeholder="Cidade ou aeroporto"
              value={route.origin}
              onChange={(v) => setRoute((r) => ({ ...r, origin: v }))}
              error={routeErr(0, "origin")}
              autoComplete="off"
            />
            <TextField
              label="Indo para"
              placeholder="Cidade ou aeroporto"
              value={route.destination}
              onChange={(v) => setRoute((r) => ({ ...r, destination: v }))}
              error={routeErr(0, "destination")}
              autoComplete="off"
            />
            <TextField
              label="Ida"
              type="date"
              value={route.depart}
              onChange={(v) => setRoute((r) => ({ ...r, depart: v }))}
              error={routeErr(0, "date")}
            />
            <PrefSelect
              label="Horário da ida"
              value={route.departTime}
              onChange={(v) => setRoute((r) => ({ ...r, departTime: v }))}
            />
            {tripType === "ROUND_TRIP" && (
              <>
                <TextField
                  label="Volta"
                  type="date"
                  value={route.ret}
                  onChange={(v) => setRoute((r) => ({ ...r, ret: v }))}
                  error={routeErr(1, "date")}
                />
                <PrefSelect
                  label="Horário da volta"
                  value={route.returnTime}
                  onChange={(v) => setRoute((r) => ({ ...r, returnTime: v }))}
                />
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {legs.map((l, i) => (
              <fieldset key={i} className="border-border rounded-md border p-4">
                <legend className="text-fg-muted px-1 text-xs font-semibold">Trecho {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Saindo de"
                    value={l.origin}
                    onChange={(v) =>
                      setLegs((ls) => ls.map((x, j) => (j === i ? { ...x, origin: v } : x)))
                    }
                    error={routeErr(i, "origin")}
                  />
                  <TextField
                    label="Indo para"
                    value={l.destination}
                    onChange={(v) =>
                      setLegs((ls) => ls.map((x, j) => (j === i ? { ...x, destination: v } : x)))
                    }
                    error={routeErr(i, "destination")}
                  />
                  <TextField
                    label="Data"
                    type="date"
                    value={l.date}
                    onChange={(v) =>
                      setLegs((ls) => ls.map((x, j) => (j === i ? { ...x, date: v } : x)))
                    }
                    error={routeErr(i, "date")}
                  />
                  <PrefSelect
                    label="Horário"
                    value={l.time}
                    onChange={(v) =>
                      setLegs((ls) => ls.map((x, j) => (j === i ? { ...x, time: v } : x)))
                    }
                  />
                </div>
                {legs.length > 2 && (
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => setLegs((ls) => ls.filter((_, j) => j !== i))}
                  >
                    <Trash2 /> Remover trecho
                  </Button>
                )}
              </fieldset>
            ))}
            {legs.length < MAX_SEGMENTS && (
              <Button
                variant="secondary"
                className="self-start"
                onClick={() =>
                  setLegs((ls) => [
                    ...ls,
                    { ...emptySegment(), origin: ls[ls.length - 1]?.destination ?? "" },
                  ])
                }
              >
                <ArrowLeftRight /> Adicionar trecho
              </Button>
            )}
          </div>
        )}
        {err("segments") && <p className="text-danger text-xs font-medium">{err("segments")}</p>}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={flexible} onCheckedChange={(v) => setFlexible(v === true)} />
          Tenho flexibilidade de datas (um dia antes ou depois)
        </label>
      </Step>

      <Step
        n={2 + offset}
        title="Passageiros"
        description="Nomes como estão no documento de viagem."
      >
        {passengers.map((p, i) => (
          <fieldset key={p.key} className="border-border rounded-md border p-4">
            <legend className="text-fg-muted px-1 text-xs font-semibold">
              Passageiro {i + 1} · {PASSENGER_TYPE_LABELS[p.type]}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Nome completo"
                value={p.name}
                onChange={(v) => setPax(p.key, { name: v })}
                error={err(`passengers.${i}.name`)}
                autoComplete="off"
              />
              <Field label="Tipo">
                {(a) => (
                  <Select
                    id={a.id}
                    value={p.type}
                    onValueChange={(v) => setPax(p.key, { type: v as PassengerType })}
                    options={PASSENGER_TYPES.map((t) => ({
                      value: t,
                      label: PASSENGER_TYPE_LABELS[t],
                    }))}
                  />
                )}
              </Field>
              <Field label="Documento">
                {(a) => (
                  <Select
                    id={a.id}
                    value={p.docType}
                    onValueChange={(v) => setPax(p.key, { docType: v as TravelDocType })}
                    options={TRAVEL_DOC_TYPES.map((t) => ({
                      value: t,
                      label: TRAVEL_DOC_LABELS[t],
                    }))}
                  />
                )}
              </Field>
              <TextField
                label="Número do documento"
                optional
                value={p.docNumber}
                onChange={(v) => setPax(p.key, { docNumber: v })}
              />
              {p.docType === "PASSPORT" && (
                <TextField
                  label="Validade do passaporte"
                  type="date"
                  optional
                  value={p.docExpiry}
                  onChange={(v) => setPax(p.key, { docExpiry: v })}
                />
              )}
              <TextField
                label="Nascimento"
                type="date"
                optional
                value={p.birthDate}
                onChange={(v) => setPax(p.key, { birthDate: v })}
              />
              {p.type !== "HOLDER" && (
                <>
                  <TextField
                    label="E-mail"
                    type="email"
                    optional
                    value={p.email}
                    onChange={(v) => setPax(p.key, { email: v })}
                  />
                  <TextField
                    label="Telefone"
                    type="tel"
                    optional
                    value={p.phone}
                    onChange={(v) => setPax(p.key, { phone: v })}
                  />
                </>
              )}
              <TextField
                label="Programa de fidelidade"
                optional
                placeholder="Ex.: LATAM Pass 123456"
                value={p.loyalty}
                onChange={(v) => setPax(p.key, { loyalty: v })}
              />
            </div>
            {passengers.length > 1 && (
              <Button
                variant="danger-ghost"
                size="sm"
                className="mt-2"
                onClick={() => setPassengers((l) => l.filter((x) => x.key !== p.key))}
              >
                <Trash2 /> Remover passageiro
              </Button>
            )}
          </fieldset>
        ))}
        {err("passengers") && (
          <p className="text-danger text-xs font-medium">{err("passengers")}</p>
        )}
        {passengers.length < MAX_PASSENGERS && (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => setPassengers((l) => [...l, newPassenger()])}
          >
            <UserPlus /> Adicionar passageiro
          </Button>
        )}
      </Step>

      <Step
        n={3 + offset}
        title="Serviços"
        description="Marque o que precisa; detalhe o que importar."
      >
        <div role="group" aria-label="Serviços pedidos" className="flex flex-wrap gap-2">
          {REQUEST_SERVICES.map((s) => {
            const Icon = SERVICE_ICON[s];
            const on = services.has(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(s)}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                  "focus-visible:outline-brand-ring focus-visible:outline-2 focus-visible:outline-offset-2",
                  on
                    ? "border-brand bg-brand-subtle text-brand-subtle-fg"
                    : "border-border-strong bg-surface text-fg-muted hover:text-fg",
                )}
              >
                {Icon && <Icon className="size-4" aria-hidden />}
                {SERVICE_LABEL[s]}
              </button>
            );
          })}
        </div>
        {err("services") && <p className="text-danger text-xs font-medium">{err("services")}</p>}

        {services.has("AIR") && (
          <fieldset className="border-border rounded-md border p-4">
            <legend className="text-fg-muted px-1 text-xs font-semibold">Aéreo</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Classe">
                {(a) => (
                  <Select
                    id={a.id}
                    value={air.cabin}
                    onValueChange={(v) => setAir((s) => ({ ...s, cabin: v }))}
                    options={CABIN_CLASSES.map((c) => ({ value: c, label: CABIN_CLASS_LABELS[c] }))}
                  />
                )}
              </Field>
              <TextField
                label="Companhia preferida"
                optional
                value={air.preferredAirline}
                onChange={(v) => setAir((s) => ({ ...s, preferredAirline: v }))}
              />
              <Field label="Assento">
                {(a) => (
                  <Select
                    id={a.id}
                    value={air.seatPreference}
                    onValueChange={(v) => setAir((s) => ({ ...s, seatPreference: v }))}
                    options={[
                      { value: "ANY", label: "Sem preferência" },
                      { value: "WINDOW", label: "Janela" },
                      { value: "AISLE", label: "Corredor" },
                    ]}
                  />
                )}
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <Checkbox
                  checked={air.checkedBaggage}
                  onCheckedChange={(v) => setAir((s) => ({ ...s, checkedBaggage: v === true }))}
                />
                Bagagem despachada
              </label>
            </div>
          </fieldset>
        )}

        {services.has("HOTEL") && (
          <fieldset className="border-border rounded-md border p-4">
            <legend className="text-fg-muted px-1 text-xs font-semibold">Hotel</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Cidade"
                value={hotel.city}
                onChange={(v) => setHotel((s) => ({ ...s, city: v }))}
              />
              <TextField
                label="Referência de localização"
                optional
                placeholder="Ex.: perto do centro de convenções"
                value={hotel.reference}
                onChange={(v) => setHotel((s) => ({ ...s, reference: v }))}
              />
              <TextField
                label="Entrada"
                type="date"
                value={hotel.checkIn}
                onChange={(v) => setHotel((s) => ({ ...s, checkIn: v }))}
              />
              <TextField
                label="Saída"
                type="date"
                value={hotel.checkOut}
                onChange={(v) => setHotel((s) => ({ ...s, checkOut: v }))}
              />
              <Field label="Categoria">
                {(a) => (
                  <Select
                    id={a.id}
                    value={hotel.stars}
                    onValueChange={(v) => setHotel((s) => ({ ...s, stars: v }))}
                    options={[
                      { value: "ANY", label: "Indiferente" },
                      { value: "3", label: "3 estrelas" },
                      { value: "4", label: "4 estrelas" },
                      { value: "5", label: "5 estrelas" },
                    ]}
                  />
                )}
              </Field>
              <Field label="Tipo de quarto">
                {(a) => (
                  <Select
                    id={a.id}
                    value={hotel.roomType}
                    onValueChange={(v) => setHotel((s) => ({ ...s, roomType: v }))}
                    options={ROOM_OPTIONS}
                  />
                )}
              </Field>
              <TextField
                label="Quartos"
                type="number"
                inputMode="numeric"
                value={hotel.rooms}
                onChange={(v) => setHotel((s) => ({ ...s, rooms: v }))}
              />
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <Checkbox
                  checked={hotel.breakfast}
                  onCheckedChange={(v) => setHotel((s) => ({ ...s, breakfast: v === true }))}
                />
                Café da manhã incluído
              </label>
            </div>
          </fieldset>
        )}

        {services.has("CAR_RENTAL") && (
          <fieldset className="border-border rounded-md border p-4">
            <legend className="text-fg-muted px-1 text-xs font-semibold">Carro</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Categoria"
                optional
                placeholder="Ex.: SUV automático"
                value={car.category}
                onChange={(v) => setCar((s) => ({ ...s, category: v }))}
              />
              <TextField
                label="Retirada"
                optional
                value={car.pickup}
                onChange={(v) => setCar((s) => ({ ...s, pickup: v }))}
              />
              <TextField
                label="Devolução"
                optional
                value={car.dropoff}
                onChange={(v) => setCar((s) => ({ ...s, dropoff: v }))}
              />
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <Checkbox
                  checked={car.extraDriver}
                  onCheckedChange={(v) => setCar((s) => ({ ...s, extraDriver: v === true }))}
                />
                Condutor adicional
              </label>
            </div>
          </fieldset>
        )}

        {services.has("EVENT_TICKET") && (
          <TextField label="Ingresso para qual evento?" value={eventName} onChange={setEventName} />
        )}

        {(
          [
            "TRANSFER",
            "CHAUFFEUR",
            "TRAVEL_INSURANCE",
            "CURRENCY_EXCHANGE",
            "VISA",
            "CONNECTIVITY",
          ] as const
        )
          .filter((s) => services.has(s))
          .map((s) => (
            <TextField
              key={s}
              label={`${SERVICE_LABEL[s]}: detalhes`}
              optional
              multiline
              rows={2}
              value={notesBy[s] ?? ""}
              onChange={(v) => setNotesBy((m) => ({ ...m, [s]: v }))}
            />
          ))}
      </Step>

      <Step n={4 + offset} title="Motivo e orçamento">
        <TextField
          label="Motivo da viagem"
          multiline
          rows={3}
          placeholder="Ex.: reunião com importadores na feira SIAL"
          value={purpose}
          onChange={setPurpose}
          error={err("purpose")}
        />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
          <TextField
            label="Orçamento total"
            optional
            inputMode="decimal"
            placeholder="Ex.: 8.500,00"
            value={budget}
            onChange={setBudget}
            error={err("budget")}
            hint="Ajuda a equipe a cotar dentro do que você espera."
          />
          <Field label="Moeda">
            {(a) => (
              <Select
                id={a.id}
                value={currency}
                onValueChange={(v) => setCurrency(v as typeof currency)}
                options={[
                  { value: "BRL", label: "Real (R$)" },
                  { value: "USD", label: "Dólar (US$)" },
                  { value: "EUR", label: "Euro (€)" },
                ]}
              />
            )}
          </Field>
        </div>
        <TextField
          label="Observações"
          optional
          multiline
          rows={3}
          value={notes}
          onChange={setNotes}
        />
      </Step>

      {formError && Object.keys(errors).length > 0 && <Notice tone="danger">{formError}</Notice>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" size="lg" loading={pending}>
          <Send /> Enviar solicitação
        </Button>
      </div>
    </form>
  );
}
