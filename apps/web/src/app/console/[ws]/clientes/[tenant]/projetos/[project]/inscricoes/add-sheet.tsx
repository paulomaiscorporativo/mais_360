"use client";

import { Check, Search, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { Select } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/overlay";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { addRegistration, searchPeople } from "./actions";
import type { Label } from "./registrations";

type Found = { id: string; name: string; detail: string; alreadyIn: boolean };

const EMPTY = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  cpf: "",
  organization: "",
  jobTitle: "",
};

export function AddRegistrationSheet({
  open,
  onOpenChange,
  tenant,
  projectId,
  categories,
  groups,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenant: string;
  projectId: string;
  categories: Label[];
  groups: Label[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"new" | "existing">("new");
  const [person, setPerson] = useState(EMPTY);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [picked, setPicked] = useState<Found | null>(null);
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "none");
  const [groupId, setGroupId] = useState<string>("none");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const r = await searchPeople({ tenant, projectId, q });
      if (id === seq.current && r.ok) setFound(r.data);
    }, 250);
    return () => clearTimeout(t);
  }, [q, tenant, projectId]);

  function reset() {
    setPerson(EMPTY);
    setQ("");
    setFound([]);
    setPicked(null);
    setErrors({});
    setError(null);
  }

  function submit() {
    setError(null);
    start(async () => {
      const r = await addRegistration({
        tenant,
        projectId,
        personId: tab === "existing" ? (picked?.id ?? null) : null,
        person: tab === "new" ? person : null,
        role: "ATTENDEE",
        categoryId: categoryId === "none" ? null : categoryId,
        groupId: groupId === "none" ? null : groupId,
        status: "CONFIRMED",
        companionOfId: null,
      });
      if (!r.ok) {
        setError(r.error);
        setErrors(
          Object.fromEntries(
            Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k.replace(/^person\./, ""), v]),
          ),
        );
        return;
      }
      toast.success("Inscrição adicionada.");
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPerson({ ...person, [k]: e.target.value });
  const canSubmit =
    tab === "new" ? person.firstName.trim().length > 0 : !!picked && !picked.alreadyIn;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Adicionar inscrição"
      description="Quem já está no cadastro do cliente não é duplicado: o sistema reconhece pelo CPF, e-mail ou telefone."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending} disabled={!canSubmit}>
            <UserPlus /> Inscrever
          </Button>
        </>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as "new" | "existing")}>
        <TabsList className="mb-5">
          <TabsTrigger value="new">Nova pessoa</TabsTrigger>
          <TabsTrigger value="existing">Do cadastro</TabsTrigger>
        </TabsList>
        <TabsContent value="new" className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" error={errors.firstName}>
            {(f) => (
              <Input
                id={f.id}
                value={person.firstName}
                onChange={set("firstName")}
                autoFocus
                aria-invalid={f.invalid}
              />
            )}
          </Field>
          <Field label="Sobrenome" optional>
            {(f) => <Input id={f.id} value={person.lastName} onChange={set("lastName")} />}
          </Field>
          <Field label="E-mail" optional className="sm:col-span-2">
            {(f) => (
              <Input
                id={f.id}
                type="email"
                inputMode="email"
                value={person.email}
                onChange={set("email")}
              />
            )}
          </Field>
          <Field label="WhatsApp" optional>
            {(f) => (
              <Input
                id={f.id}
                type="tel"
                inputMode="tel"
                value={person.phone}
                onChange={set("phone")}
                placeholder="(11) 99999-8888"
              />
            )}
          </Field>
          <Field label="CPF" optional>
            {(f) => (
              <Input
                id={f.id}
                inputMode="numeric"
                value={person.cpf}
                onChange={set("cpf")}
                placeholder="000.000.000-00"
              />
            )}
          </Field>
          <Field label="Empresa" optional>
            {(f) => <Input id={f.id} value={person.organization} onChange={set("organization")} />}
          </Field>
          <Field label="Cargo" optional>
            {(f) => <Input id={f.id} value={person.jobTitle} onChange={set("jobTitle")} />}
          </Field>
        </TabsContent>
        <TabsContent value="existing">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPicked(null);
            }}
            placeholder="Nome, empresa, e-mail ou CPF"
            leading={<Search />}
            aria-label="Buscar no cadastro"
            autoFocus
          />
          <ul className="mt-3 flex flex-col gap-1" role="listbox" aria-label="Pessoas encontradas">
            {q.trim().length >= 2 && found.length === 0 && (
              <li className="text-fg-subtle px-1 py-3 text-sm">
                Ninguém encontrado. Cadastre em “Nova pessoa”.
              </li>
            )}
            {found.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={picked?.id === f.id}
                  disabled={f.alreadyIn}
                  onClick={() => setPicked(f)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left transition-colors",
                    "hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50",
                    picked?.id === f.id && "bg-brand-subtle",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium">{f.name}</span>
                    <span className="text-fg-subtle block truncate text-sm">
                      {f.alreadyIn ? "Já inscrito neste projeto" : f.detail || "—"}
                    </span>
                  </span>
                  {picked?.id === f.id && <Check className="text-brand-text size-4" />}
                </button>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>

      <div className="border-border mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2">
        <Field label="Categoria">
          {(f) => (
            <Select
              id={f.id}
              value={categoryId}
              onValueChange={setCategoryId}
              options={[
                { value: "none", label: "Sem categoria" },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          )}
        </Field>
        <Field label="Grupo" optional>
          {(f) => (
            <Select
              id={f.id}
              value={groupId}
              onValueChange={setGroupId}
              options={[
                { value: "none", label: "Sem grupo" },
                ...groups.map((g) => ({ value: g.id, label: g.name })),
              ]}
            />
          )}
        </Field>
      </div>

      {error && (
        <Notice tone="danger" className="mt-5">
          {error}
        </Notice>
      )}
    </Sheet>
  );
}
