"use client";

import { CheckCircle2, Download, Info } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState, useTransition } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { Checkbox } from "@/components/ui/controls";
import { submitPublicRegistration } from "./actions";

const maskCpf = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const EMPTY = {
  fullName: "",
  badgeName: "",
  email: "",
  phone: "",
  cpf: "",
  organization: "",
  jobTitle: "",
  city: "",
  state: "",
};

type Done =
  | { already: true; firstName: string }
  | { already: false; firstName: string; delivered: true }
  | { already: false; firstName: string; delivered: false; token: string; shortCode: string };

const big = "h-12 text-md px-4";

export function PublicRegistrationForm(props: {
  tenantSlug: string;
  token: string;
  welcome: string;
  successMessage: string;
  fields: {
    cpf: boolean;
    cpfRequired: boolean;
    company: boolean;
    jobTitle: boolean;
    city: boolean;
    contactSharing: boolean;
  };
  credentialBase: string;
  tenantName: string;
}) {
  const [f, setF] = useState(EMPTY);
  const [accept, setAccept] = useState(false);
  const [sharing, setSharing] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (done && !done.already && !done.delivered) {
      QRCode.toDataURL(props.credentialBase + done.token, {
        width: 640,
        margin: 1,
        errorCorrectionLevel: "M",
      }).then(setQr);
    }
  }, [done, props.credentialBase]);

  const set =
    (k: keyof typeof EMPTY, mask?: (v: string) => string) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setF({ ...f, [k]: mask ? mask(e.target.value) : e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await submitPublicRegistration({
        tenantSlug: props.tenantSlug,
        token: props.token,
        ...f,
        contactSharing: props.fields.contactSharing && sharing,
        acceptTerms: accept,
        website: (document.getElementById("website") as HTMLInputElement | null)?.value ?? "",
      });
      if (!r.ok) {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
        return;
      }
      setErrors({});
      setDone(r.data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (done && !done.already && done.delivered) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="text-success size-10" />
        <p className="text-lg font-semibold">Inscrição confirmada, {done.firstName}!</p>
        <p className="text-fg-muted max-w-sm text-base">
          Encontramos seu cadastro. Por segurança, a credencial vai para o e-mail e o WhatsApp já
          registrados.
        </p>
      </div>
    );
  }

  if (done) {
    return done.already ? (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Info className="text-info size-10" />
        <p className="text-lg font-semibold">{done.firstName}, você já está inscrito</p>
        <p className="text-fg-muted max-w-sm text-base">
          Sua credencial foi enviada para o e-mail e o WhatsApp cadastrados. Não encontrou? Fale com
          a organização.
        </p>
      </div>
    ) : (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <CheckCircle2 className="text-success size-10" />
        <div>
          <p className="text-lg font-semibold">Inscrição confirmada, {done.firstName}!</p>
          <p className="text-fg-muted mt-1 text-base">
            {props.successMessage || "Guarde este QR code: ele é a sua credencial no dia."}
          </p>
        </div>
        <div className="border-border w-full max-w-[280px] rounded-lg border bg-white p-4 shadow-sm">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code da sua credencial" className="w-full" />
          ) : (
            <div className="bg-surface-sunken aspect-square w-full animate-pulse rounded-sm" />
          )}
          <p className="tabular mt-3 font-mono text-2xl tracking-[0.2em] text-black">
            {done.shortCode}
          </p>
          <p className="text-xs text-black/60">código para digitar na recepção</p>
        </div>
        {qr && (
          <Button variant="secondary" asChild>
            <a href={qr} download={`credencial-${done.shortCode}.png`}>
              <Download /> Salvar imagem
            </a>
          </Button>
        )}
      </div>
    );
  }

  const err = (k: string) => errors[k];

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {props.welcome && (
        <p className="text-fg-muted text-base whitespace-pre-line">{props.welcome}</p>
      )}

      <Field label="Nome completo" error={err("fullName")}>
        {(i) => (
          <Input
            id={i.id}
            className={big}
            autoComplete="name"
            value={f.fullName}
            onChange={set("fullName")}
            aria-invalid={i.invalid}
            aria-describedby={i.describedBy}
            required
          />
        )}
      </Field>
      <Field label="Como quer aparecer no crachá" hint="Ex.: Maria Souza" optional>
        {(i) => (
          <Input
            id={i.id}
            className={big}
            value={f.badgeName}
            onChange={set("badgeName")}
            maxLength={40}
          />
        )}
      </Field>
      <Field label="E-mail" error={err("email")}>
        {(i) => (
          <Input
            id={i.id}
            className={big}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={f.email}
            onChange={set("email")}
            aria-invalid={i.invalid}
            aria-describedby={i.describedBy}
            required
          />
        )}
      </Field>
      <Field
        label="WhatsApp"
        hint="Com DDD. Você recebe a credencial e os avisos por aqui."
        error={err("phone")}
      >
        {(i) => (
          <Input
            id={i.id}
            className={big}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(11) 99999-8888"
            value={f.phone}
            onChange={set("phone", maskPhone)}
            aria-invalid={i.invalid}
            aria-describedby={i.describedBy}
            required
          />
        )}
      </Field>
      {props.fields.cpf && (
        <Field label="CPF" optional={!props.fields.cpfRequired} error={err("cpf")}>
          {(i) => (
            <Input
              id={i.id}
              className={big}
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={f.cpf}
              onChange={set("cpf", maskCpf)}
              aria-invalid={i.invalid}
              aria-describedby={i.describedBy}
            />
          )}
        </Field>
      )}
      {props.fields.company && (
        <Field label="Empresa" optional>
          {(i) => (
            <Input
              id={i.id}
              className={big}
              autoComplete="organization"
              value={f.organization}
              onChange={set("organization")}
            />
          )}
        </Field>
      )}
      {props.fields.jobTitle && (
        <Field label="Cargo" optional>
          {(i) => (
            <Input
              id={i.id}
              className={big}
              autoComplete="organization-title"
              value={f.jobTitle}
              onChange={set("jobTitle")}
            />
          )}
        </Field>
      )}
      {props.fields.city && (
        <div className="grid grid-cols-[1fr_88px] gap-3">
          <Field label="Cidade" optional>
            {(i) => (
              <Input
                id={i.id}
                className={big}
                autoComplete="address-level2"
                value={f.city}
                onChange={set("city")}
              />
            )}
          </Field>
          <Field label="UF" optional>
            {(i) => (
              <Input
                id={i.id}
                className={big}
                maxLength={2}
                value={f.state}
                onChange={set("state", (v) => v.toUpperCase().replace(/[^A-Z]/g, ""))}
              />
            )}
          </Field>
        </div>
      )}

      {/* Isca para robôs: invisível para pessoas */}
      <input
        id="website"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="sr-only"
        aria-hidden
      />

      <div className="border-border flex flex-col gap-4 border-t pt-5">
        {props.fields.contactSharing && (
          <label className="flex items-start gap-3 text-base">
            <Checkbox
              checked={sharing}
              onCheckedChange={(v) => setSharing(v === true)}
              className="mt-0.5"
            />
            <span>
              Autorizo que meu e-mail e WhatsApp sejam compartilhados com quem ler meu crachá no
              evento.
              <span className="text-fg-subtle block text-sm">Você pode mudar isso depois.</span>
            </span>
          </label>
        )}
        <label className="flex items-start gap-3 text-base">
          <Checkbox
            checked={accept}
            onCheckedChange={(v) => setAccept(v === true)}
            className="mt-0.5"
            aria-invalid={!!err("acceptTerms")}
          />
          <span>
            Concordo com o uso dos meus dados por {props.tenantName} para esta inscrição, conforme a
            LGPD.
            {err("acceptTerms") && (
              <span className="text-danger block text-sm">{err("acceptTerms")}</span>
            )}
          </span>
        </label>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <Button type="submit" size="lg" block loading={pending} disabled={!accept}>
        Confirmar inscrição
      </Button>
    </form>
  );
}
