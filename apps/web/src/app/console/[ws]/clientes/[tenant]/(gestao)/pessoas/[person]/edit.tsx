"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Field, Input, Notice, Textarea } from "@/components/ui";
import { Sheet } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { updatePerson } from "../actions";

type Data = {
  firstName: string;
  lastName: string;
  badgeName: string;
  socialName: string;
  email: string;
  phone: string;
  cpf: string;
  birthDate: string;
  nationality: string;
  jobTitle: string;
  city: string;
  state: string;
  passportNumber: string;
  passportExpiry: string;
  rg: string;
  dietary: string;
  medicalNotes: string;
  emergencyName: string;
  emergencyPhone: string;
};

const SECTIONS: {
  title: string;
  fields: { key: keyof Data; label: string; type?: string; wide?: boolean; area?: boolean }[];
}[] = [
  {
    title: "Identificação",
    fields: [
      { key: "firstName", label: "Nome" },
      { key: "lastName", label: "Sobrenome" },
      { key: "badgeName", label: "Nome no crachá" },
      { key: "socialName", label: "Nome social" },
      { key: "email", label: "E-mail", type: "email", wide: true },
      { key: "phone", label: "WhatsApp", type: "tel" },
      { key: "cpf", label: "CPF" },
      { key: "birthDate", label: "Nascimento", type: "date" },
      { key: "jobTitle", label: "Cargo" },
      { key: "city", label: "Cidade" },
      { key: "state", label: "UF" },
    ],
  },
  {
    title: "Documentos de viagem",
    fields: [
      { key: "passportNumber", label: "Passaporte" },
      { key: "passportExpiry", label: "Validade do passaporte", type: "date" },
      { key: "rg", label: "RG" },
      { key: "nationality", label: "Nacionalidade" },
    ],
  },
  {
    title: "Saúde e emergência",
    fields: [
      { key: "dietary", label: "Restrições alimentares", wide: true, area: true },
      { key: "medicalNotes", label: "Observações médicas", wide: true, area: true },
      { key: "emergencyName", label: "Contato de emergência" },
      { key: "emergencyPhone", label: "Telefone de emergência", type: "tel" },
    ],
  },
];

export function EditPerson({
  tenant,
  personId,
  initial,
}: {
  tenant: string;
  personId: string;
  initial: Data;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const r = await updatePerson({ tenant, personId, data });
      if (!r.ok) {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
        return;
      }
      toast.success("Cadastro atualizado.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Pencil /> Editar cadastro
      </Button>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setData(initial);
            setErrors({});
            setError(null);
          }
        }}
        size="lg"
        title="Editar cadastro"
        description="As mudanças valem para todos os projetos desta pessoa."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} loading={pending}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-8">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="mb-3 text-sm font-semibold">{s.title}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {s.fields.map((f) => (
                  <Field
                    key={f.key}
                    label={f.label}
                    error={errors[`data.${f.key}`]}
                    className={f.wide ? "sm:col-span-2" : undefined}
                  >
                    {(ids) =>
                      f.area ? (
                        <Textarea
                          id={ids.id}
                          rows={2}
                          value={data[f.key]}
                          onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                        />
                      ) : (
                        <Input
                          id={ids.id}
                          type={f.type ?? "text"}
                          value={data[f.key]}
                          maxLength={f.key === "state" ? 2 : undefined}
                          onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                          aria-invalid={ids.invalid}
                          aria-describedby={ids.describedBy}
                        />
                      )
                    }
                  </Field>
                ))}
              </div>
            </section>
          ))}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      </Sheet>
    </>
  );
}
