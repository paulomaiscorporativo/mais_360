"use client";

import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  IMPORT_FIELDS,
  applyMapping,
  guessColumnMapping,
  rowHasName,
  type ColumnMapping,
  type ImportFieldKey,
} from "@mais/core";
import { Button, Field, Notice } from "@/components/ui";
import { Checkbox, Select } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { importRegistrations } from "./actions";
import type { Label } from "./registrations";

type Parsed = { fileName: string; headers: string[]; rows: unknown[][] };
type Result = {
  created: number;
  existingPeople: number;
  alreadyRegistered: number;
  skipped: number;
  errors: string[];
};

const MAX_ROWS = 5000;

function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/**
 * Importação em três passos: arquivo → conferir colunas → resultado.
 * A planilha é lida NO NAVEGADOR (SheetJS); o servidor recebe só as linhas
 * mapeadas, validadas por zod — nenhum arquivo binário de terceiros é
 * interpretado no servidor.
 */
export function ImportSheet({
  open,
  onOpenChange,
  tenant,
  projectId,
  categories,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenant: string;
  projectId: string;
  categories: Label[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "none");
  const [status, setStatus] = useState<"CONFIRMED" | "PENDING">("CONFIRMED");
  const [createCats, setCreateCats] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [pending, start] = useTransition();

  function reset() {
    setParsed(null);
    setMapping({});
    setResult(null);
    setError(null);
  }

  async function readFile(file: File) {
    setError(null);
    setReading(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      // CSV: o SheetJS assume Windows-1252; decodificamos como UTF-8 e, se o
      // arquivo não for UTF-8 válido (CSV salvo pelo Excel), como Windows-1252.
      const wb = /\.(csv|txt)$/i.test(file.name)
        ? XLSX.read(decodeText(buf), { type: "string", raw: true })
        : XLSX.read(buf, { type: "array", cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
      if (!sheet) throw new Error("A planilha está vazia.");
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
      });
      const [head, ...body] = matrix;
      const headers = (head ?? []).map((h) => String(h ?? "").trim());
      const rows = body.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
      if (!headers.length || !rows.length)
        throw new Error("Não encontramos linhas com dados na primeira aba.");
      if (rows.length > MAX_ROWS)
        throw new Error(`A planilha tem ${rows.length} linhas; importe até ${MAX_ROWS} por vez.`);
      setParsed({ fileName: file.name, headers, rows });
      setMapping(guessColumnMapping(headers));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível ler o arquivo. Use .xlsx, .xls ou .csv.",
      );
    } finally {
      setReading(false);
    }
  }

  const mapped = useMemo(
    () => (parsed ? parsed.rows.map((r) => applyMapping(r, mapping)).filter(rowHasName) : []),
    [parsed, mapping],
  );
  const hasName = mapping.fullName !== undefined || mapping.firstName !== undefined;

  function setColumn(key: ImportFieldKey, value: string) {
    setMapping((m) => {
      const next = { ...m };
      // uma coluna só alimenta um campo
      for (const k of Object.keys(next) as ImportFieldKey[])
        if (String(next[k]) === value) delete next[k];
      if (value === "none") delete next[key];
      else next[key] = Number(value);
      return next;
    });
  }

  function submit() {
    setError(null);
    start(async () => {
      const r = await importRegistrations({
        tenant,
        projectId,
        rows: mapped,
        defaultCategoryId: categoryId === "none" ? null : categoryId,
        status,
        createMissingCategories: createCats,
      });
      if (!r.ok) return setError(r.error);
      setResult(r.data);
      toast.success(`${r.data.created} inscrições importadas.`);
      router.refresh();
    });
  }

  const columnOptions = [
    { value: "none", label: "— não importar —" },
    ...(parsed?.headers ?? []).map((h, i) => ({ value: String(i), label: h || `Coluna ${i + 1}` })),
  ];

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      size="lg"
      title="Importar planilha"
      description="Excel ou CSV, uma pessoa por linha. Quem já está no cadastro (mesmo CPF, e-mail ou telefone) não é duplicado."
      footer={
        result ? (
          <Button onClick={() => onOpenChange(false)}>Concluir</Button>
        ) : parsed ? (
          <>
            <Button variant="ghost" onClick={reset}>
              Trocar arquivo
            </Button>
            <Button onClick={submit} loading={pending} disabled={!hasName || mapped.length === 0}>
              Importar {mapped.length} {mapped.length === 1 ? "linha" : "linhas"}
            </Button>
          </>
        ) : undefined
      }
    >
      {!parsed && !result && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void readFile(f);
          }}
          className="border-border-strong hover:border-brand-ring hover:bg-surface-muted flex w-full flex-col items-center gap-3 rounded-md border border-dashed px-6 py-14 text-center transition-colors"
        >
          <span className="bg-brand-subtle text-brand-subtle-fg grid size-11 place-items-center rounded-full">
            {reading ? (
              <FileSpreadsheet className="size-5 animate-pulse" />
            ) : (
              <Upload className="size-5" />
            )}
          </span>
          <span className="text-base font-medium">
            {reading ? "Lendo planilha…" : "Escolha ou arraste a planilha"}
          </span>
          <span className="text-fg-subtle text-sm">
            .xlsx, .xls ou .csv · até {MAX_ROWS.toLocaleString("pt-BR")} linhas
          </span>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
              e.target.value = "";
            }}
          />
        </button>
      )}

      {parsed && !result && (
        <div className="flex flex-col gap-6">
          <p className="text-fg-muted text-sm">
            <span className="text-fg font-medium">{parsed.fileName}</span> · {parsed.rows.length}{" "}
            linhas. Confira o que cada coluna representa — já reconhecemos as mais comuns.
          </p>
          {!hasName && (
            <Notice tone="warning">
              Indique a coluna do nome (ou nome completo) para continuar.
            </Notice>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                {(ids) => (
                  <Select
                    id={ids.id}
                    value={mapping[f.key] !== undefined ? String(mapping[f.key]) : "none"}
                    onValueChange={(v) => setColumn(f.key, v)}
                    options={columnOptions}
                  />
                )}
              </Field>
            ))}
          </div>

          {mapped.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Prévia</h3>
              <div className="border-border overflow-x-auto rounded-md border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-muted text-fg-subtle text-xs">
                    <tr>
                      <th className="px-3 py-2 font-medium">Nome</th>
                      <th className="px-3 py-2 font-medium">E-mail</th>
                      <th className="px-3 py-2 font-medium">Empresa</th>
                      <th className="px-3 py-2 font-medium">Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapped.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-border border-t">
                        <td className="px-3 py-2">
                          {r.fullName ?? [r.firstName, r.lastName].filter(Boolean).join(" ")}
                        </td>
                        <td className="text-fg-muted px-3 py-2">{r.email ?? "—"}</td>
                        <td className="text-fg-muted px-3 py-2">{r.organization ?? "—"}</td>
                        <td className="text-fg-muted px-3 py-2">{r.category ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="border-border grid gap-4 border-t pt-5 sm:grid-cols-2">
            <Field label="Categoria padrão" hint="Usada quando a linha não traz categoria.">
              {(ids) => (
                <Select
                  id={ids.id}
                  value={categoryId}
                  onValueChange={setCategoryId}
                  options={[
                    { value: "none", label: "Sem categoria" },
                    ...categories.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              )}
            </Field>
            <Field label="Status das inscrições">
              {(ids) => (
                <Select
                  id={ids.id}
                  value={status}
                  onValueChange={(v) => setStatus(v as "CONFIRMED" | "PENDING")}
                  options={[
                    { value: "CONFIRMED", label: "Confirmadas" },
                    { value: "PENDING", label: "Pendentes de confirmação" },
                  ]}
                />
              )}
            </Field>
            {mapping.category !== undefined && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox checked={createCats} onCheckedChange={(v) => setCreateCats(v === true)} />
                Criar as categorias da planilha que ainda não existem no projeto
              </label>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <CheckCircle2 className="text-success size-10" />
          <div>
            <p className="text-lg font-semibold">{result.created} inscrições criadas</p>
            <p className="text-fg-muted mt-1 text-sm">
              {result.existingPeople > 0 &&
                `${result.existingPeople} já estavam no cadastro e foram reaproveitadas. `}
              {result.alreadyRegistered > 0 && `${result.alreadyRegistered} já estavam inscritas. `}
              {result.skipped > 0 && `${result.skipped} linhas sem nome foram ignoradas.`}
            </p>
          </div>
          {result.errors.length > 0 && (
            <Notice
              tone="warning"
              title={`${result.errors.length} linhas com problema`}
              className="w-full text-left"
            >
              <ul className="mt-1 list-disc pl-4">
                {result.errors.slice(0, 8).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Notice>
          )}
        </div>
      )}

      {error && (
        <Notice tone="danger" className="mt-5">
          {error}
        </Notice>
      )}
    </Sheet>
  );
}
