"use client";

import { ExternalLink, MapPin, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Field, FormSection, Input, Notice, Textarea } from "@/components/ui";
import { Switch } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import { saveEventSettings, saveInviteMessage } from "../actions";

type Hotel = { nome: string; endereco: string; telefone: string; distancia: string; link: string };
type Amenity = { titulo: string; descricao: string };

type Initial = {
  eventTime: string;
  dressCode: string;
  inviteDeadline: string;
  defaultQuota: string;
  autoSendOnCompanyRegistration: boolean;
  allowCompanion: boolean;
  venueName: string;
  venueAddress: string;
  description: string;
  hotels: Hotel[];
  amenities: Amenity[];
};

const FIELD_CHIPS = [
  "primeiro_nome",
  "projeto",
  "data_inicio",
  "hora_inicio",
  "local",
  "endereco",
  "traje",
  "mesa",
  "empresa_convidante",
  "link_cracha",
  "codigo",
];

export function EventSettingsForm({
  tenant,
  projectId,
  initial,
  message,
  communicationHref,
  timezone,
}: {
  tenant: string;
  projectId: string;
  initial: Initial;
  message: { custom: boolean; emailSubject: string; emailBody: string; whatsappBody: string };
  communicationHref: string;
  timezone: string;
}) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [m, setM] = useState(message);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [savingMsg, startMsg] = useTransition();

  const set =
    <K extends keyof Initial>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });

  const mapsUrl = [f.venueName, f.venueAddress].filter(Boolean).join(" ").trim()
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${f.venueName} ${f.venueAddress}`)}`
    : null;

  function save() {
    start(async () => {
      const r = await saveEventSettings({
        tenant,
        projectId,
        ...f,
        defaultQuota: Number(f.defaultQuota),
      });
      if (r.ok) {
        toast.success("Configurações do evento salvas.");
        setErrors({});
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
      }
    });
  }

  function saveMessage() {
    startMsg(async () => {
      const r = await saveInviteMessage({ tenant, projectId, ...m });
      if (r.ok) {
        toast.success("Mensagem do convite salva.");
        setM({ ...m, custom: true });
      } else toast.error(r.error);
    });
  }

  return (
    <div className="max-w-4xl">
      <FormSection
        title="Quando e onde"
        description={`Data do evento vem do projeto. Horário no fuso ${timezone}.`}
      >
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <Field label="Horário" error={errors.eventTime}>
            {(a) => <Input {...a} type="time" value={f.eventTime} onChange={set("eventTime")} />}
          </Field>
          <Field label="Local" optional>
            {(a) => (
              <Input {...a} value={f.venueName} onChange={set("venueName")} placeholder="Casa Bizutt" />
            )}
          </Field>
        </div>
        <Field label="Endereço" optional>
          {(a) => (
            <Input
              {...a}
              value={f.venueAddress}
              onChange={set("venueAddress")}
              placeholder="Rua do Ator, 577 — São Paulo/SP"
            />
          )}
        </Field>
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-text inline-flex items-center gap-1.5 self-start text-sm font-medium hover:underline"
          >
            <MapPin className="size-4" /> Conferir no mapa
          </a>
        )}
        <Field label="Traje" optional>
          {(a) => (
            <Input {...a} value={f.dressCode} onChange={set("dressCode")} placeholder="Esporte fino" />
          )}
        </Field>
      </FormSection>

      <FormSection
        title="Texto do convite"
        description="Aparece no convite digital, abaixo do título do evento."
      >
        <Field label="Apresentação" optional error={errors.description}>
          {(a) => (
            <Textarea
              {...a}
              rows={4}
              value={f.description}
              onChange={set("description")}
              placeholder="Uma noite de celebração com os associados e parceiros…"
            />
          )}
        </Field>
      </FormSection>

      <FormSection
        title="Cotas das empresas"
        description="Depois da data-limite, as sobras voltam ao pool individual da organização."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data-limite" optional hint="Até 23h59 deste dia" error={errors.inviteDeadline}>
            {(a) => (
              <Input {...a} type="date" value={f.inviteDeadline} onChange={set("inviteDeadline")} />
            )}
          </Field>
          <Field label="Cota padrão por empresa" error={errors.defaultQuota}>
            {(a) => (
              <Input
                {...a}
                type="number"
                min={1}
                inputMode="numeric"
                value={f.defaultQuota}
                onChange={set("defaultQuota")}
              />
            )}
          </Field>
        </div>
        <Toggle
          label="Enviar o convite quando a empresa inscrever alguém"
          hint="O convidado recebe na hora, por e-mail e WhatsApp."
          checked={f.autoSendOnCompanyRegistration}
          onChange={(v) => setF({ ...f, autoSendOnCompanyRegistration: v })}
        />
      </FormSection>

      <FormSection title="Hotéis próximos" description="Ajudam quem vem de fora. Aparecem no convite.">
        {f.hotels.map((h, i) => (
          <div key={i} className="border-border grid gap-3 rounded-md border p-4 sm:grid-cols-2">
            <Input
              aria-label="Nome do hotel"
              placeholder="Nome do hotel"
              value={h.nome}
              onChange={(e) => setF({ ...f, hotels: patch(f.hotels, i, { nome: e.target.value }) })}
            />
            <Input
              aria-label="Distância"
              placeholder="Distância (ex.: 600 m)"
              value={h.distancia}
              onChange={(e) =>
                setF({ ...f, hotels: patch(f.hotels, i, { distancia: e.target.value }) })
              }
            />
            <Input
              aria-label="Endereço do hotel"
              placeholder="Endereço"
              value={h.endereco}
              onChange={(e) => setF({ ...f, hotels: patch(f.hotels, i, { endereco: e.target.value }) })}
            />
            <div className="flex gap-2">
              <Input
                aria-label="Telefone do hotel"
                placeholder="Telefone"
                value={h.telefone}
                onChange={(e) =>
                  setF({ ...f, hotels: patch(f.hotels, i, { telefone: e.target.value }) })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remover hotel"
                onClick={() => setF({ ...f, hotels: f.hotels.filter((_, j) => j !== i) })}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
        <Button
          variant="secondary"
          className="self-start"
          onClick={() =>
            setF({
              ...f,
              hotels: [...f.hotels, { nome: "", endereco: "", telefone: "", distancia: "", link: "" }],
            })
          }
        >
          <Plus /> Hotel
        </Button>
      </FormSection>

      <FormSection
        title="Comodidades"
        description="Estacionamento, recepção, acessibilidade… tudo o que o convidado precisa saber."
      >
        {f.amenities.map((a, i) => (
          <div key={i} className="flex gap-2">
            <Input
              aria-label="Comodidade"
              placeholder="Estacionamento"
              className="sm:w-56"
              value={a.titulo}
              onChange={(e) =>
                setF({ ...f, amenities: patch(f.amenities, i, { titulo: e.target.value }) })
              }
            />
            <Input
              aria-label="Detalhe"
              placeholder="Com manobrista no local"
              value={a.descricao}
              onChange={(e) =>
                setF({ ...f, amenities: patch(f.amenities, i, { descricao: e.target.value }) })
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remover"
              onClick={() => setF({ ...f, amenities: f.amenities.filter((_, j) => j !== i) })}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => setF({ ...f, amenities: [...f.amenities, { titulo: "", descricao: "" }] })}
        >
          <Plus /> Comodidade
        </Button>
      </FormSection>

      <div className="border-border bg-surface/80 sticky bottom-20 z-10 -mx-1 flex justify-end rounded-md border px-3 py-2 backdrop-blur md:bottom-4">
        <Button onClick={save} loading={pending}>
          Salvar configurações
        </Button>
      </div>

      <FormSection
        className="mt-10"
        title="Mensagem do convite"
        description={
          m.custom
            ? "Modelo próprio deste evento."
            : "Usando o modelo padrão. Ao salvar, este evento passa a ter o seu."
        }
      >
        <Field label="Assunto do e-mail">
          {(a) => (
            <Input {...a} value={m.emailSubject} onChange={(e) => setM({ ...m, emailSubject: e.target.value })} />
          )}
        </Field>
        <Field label="Texto do e-mail" hint="**negrito** e quebras de linha. O convite digital e os botões entram sozinhos.">
          {(a) => (
            <Textarea
              {...a}
              rows={9}
              value={m.emailBody}
              onChange={(e) => setM({ ...m, emailBody: e.target.value })}
            />
          )}
        </Field>
        <Field label="Texto do WhatsApp" hint="*negrito* do WhatsApp. Inclua {{link_cracha}} para o convite.">
          {(a) => (
            <Textarea
              {...a}
              rows={6}
              value={m.whatsappBody}
              onChange={(e) => setM({ ...m, whatsappBody: e.target.value })}
            />
          )}
        </Field>
        <p className="text-fg-subtle text-xs">
          Campos:{" "}
          {FIELD_CHIPS.map((c) => (
            <code key={c} className="bg-surface-sunken mr-1 rounded px-1 py-0.5">{`{{${c}}}`}</code>
          ))}
        </p>
        <Notice tone="info">
          Pré-visualização com convidados reais, envio de teste e o modelo de cancelamento ficam em{" "}
          <Link href={communicationHref} className="font-medium underline">
            Comunicação → Modelos <ExternalLink className="inline size-3" />
          </Link>
          .
        </Notice>
        <Button variant="secondary" onClick={saveMessage} loading={savingMsg} className="self-start">
          Salvar mensagem
        </Button>
      </FormSection>
    </div>
  );
}

function patch<T>(list: T[], i: number, data: Partial<T>): T[] {
  return list.map((x, j) => (j === i ? { ...x, ...data } : x));
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="border-border flex items-start justify-between gap-3 rounded-md border p-4">
      <span>
        <span className="block text-base font-medium">{label}</span>
        <span className="text-fg-subtle block text-sm">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
