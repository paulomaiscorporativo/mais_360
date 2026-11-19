"use client";

import { useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Braces,
  Plus,
  Printer,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  PAGE_PRESETS,
  VOUCHER_SECTION_KEYS,
  type DocumentDefinition,
  type DocumentElement,
  type FieldDefinition,
  type Hole,
  type SectionsElement,
  type TextStyle,
} from "@mais/core";
import { Button } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  ColorInput,
  FieldSelect,
  NumberInput,
  Pair,
  Row,
  Section,
  Segmented,
  Toggle,
  inputCls,
  type BrandColors,
} from "./controls";
import { ELEMENT_LABEL, type Editor } from "./use-editor";

export async function uploadAsset(tenant: string, file: File) {
  const form = new FormData();
  form.set("tenant", tenant);
  form.set("file", file);
  const res = await fetch("/api/documents/assets", { method: "POST", body: form });
  const data = (await res.json()) as { id?: string; error?: string; mimeType?: string };
  if (!res.ok || !data.id) throw new Error(data.error ?? "Não foi possível enviar o arquivo.");
  return { id: data.id, mimeType: data.mimeType ?? file.type };
}

const ROLES: { value: string; label: string }[] = [
  { value: "ATTENDEE", label: "Participante" },
  { value: "GUEST", label: "Convidado" },
  { value: "EXHIBITOR", label: "Expositor" },
  { value: "SPEAKER", label: "Palestrante" },
  { value: "STAFF", label: "Equipe" },
  { value: "PRESS", label: "Imprensa" },
  { value: "TRAVELER", label: "Viajante" },
  { value: "COMPANION", label: "Acompanhante" },
];

const SECTION_LABEL: Record<string, string> = {
  passenger: "Passageiro",
  flights: "Voos",
  accommodation: "Hospedagem",
  itinerary: "Roteiro",
  emergency: "Contato de emergência",
  freeText: "Texto livre",
};

// ── Elemento ────────────────────────────────────────────────────────────────

export function ElementInspector({
  editor,
  el,
  fields,
  brand,
  tenant,
  pageCount,
}: {
  editor: Editor;
  el: DocumentElement;
  fields: FieldDefinition[];
  brand: BrandColors;
  tenant: string;
  pageCount: number;
}) {
  const up = (patch: Record<string, unknown>) => editor.updateElement(el.id, patch);
  const upStyle = (patch: Partial<TextStyle>) => editor.updateStyle(el.id, patch);
  const textRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div>
      <Section
        title={ELEMENT_LABEL[el.type]}
        action={
          <div className="flex gap-0.5">
            <IconBtn label="Trazer para frente" onClick={() => editor.reorder(el.id, "up")}>
              <ArrowUp />
            </IconBtn>
            <IconBtn label="Enviar para trás" onClick={() => editor.reorder(el.id, "down")}>
              <ArrowDown />
            </IconBtn>
            <IconBtn label="Excluir elemento" onClick={() => editor.remove([el.id])} danger>
              <Trash2 />
            </IconBtn>
          </div>
        }
      >
        <Row label="Nome" htmlFor="el-label">
          <input
            id="el-label"
            className={inputCls}
            value={el.label}
            placeholder="Para achar nas camadas"
            onChange={(e) => up({ label: e.target.value })}
          />
        </Row>
        <Row label="Posição">
          <Pair>
            <NumberInput ariaLabel="X" value={el.x} unit="x" onChange={(x) => up({ x })} />
            <NumberInput ariaLabel="Y" value={el.y} unit="y" onChange={(y) => up({ y })} />
          </Pair>
        </Row>
        {el.type === "qrcode" ? (
          <Row label="Tamanho">
            <NumberInput value={el.size} unit="mm" min={5} onChange={(size) => up({ size })} />
          </Row>
        ) : (
          <Row label="Tamanho">
            <Pair>
              <NumberInput
                ariaLabel="Largura"
                value={el.w}
                unit="L"
                min={1}
                onChange={(w) => up({ w })}
              />
              <NumberInput
                ariaLabel="Altura"
                value={el.h}
                unit="A"
                min={1}
                onChange={(h) => up({ h })}
              />
            </Pair>
          </Row>
        )}
        {(el.type === "text" || el.type === "field") && (
          <Row label="Rotação">
            <Segmented
              ariaLabel="Rotação"
              value={el.rotate}
              onChange={(rotate) => up({ rotate })}
              options={[0, 90, 180, 270].map((v) => ({ value: v as 0, label: `${v}°` }))}
            />
          </Row>
        )}
        {pageCount > 1 && (
          <Row label="Página">
            <select
              className={inputCls}
              value={el.page}
              onChange={(e) => up({ page: Number(e.target.value) })}
            >
              {Array.from({ length: pageCount }, (_, i) => (
                <option key={i} value={i}>
                  Página {i + 1}
                </option>
              ))}
            </select>
          </Row>
        )}
        {editor.def.kind === "VOUCHER" && (
          <Toggle
            checked={el.repeat}
            onChange={(repeat) => up({ repeat })}
            label="Repetir nas páginas de continuação"
            hint="Cabeçalho e rodapé quando as seções transbordam."
          />
        )}
      </Section>

      {el.type === "text" && (
        <Section title="Conteúdo">
          <textarea
            ref={textRef}
            rows={3}
            className={cn(inputCls, "h-auto py-1.5")}
            value={el.text}
            onChange={(e) => up({ text: e.target.value })}
          />
          <InsertField
            fields={fields}
            onPick={(key) => {
              const ta = textRef.current;
              const at = ta?.selectionStart ?? el.text.length;
              up({ text: `${el.text.slice(0, at)}{{${key}}}${el.text.slice(at)}` });
            }}
          />
        </Section>
      )}

      {el.type === "field" && (
        <Section title="Campo">
          <FieldSelect value={el.field} onChange={(field) => up({ field })} fields={fields} />
          <Row label="Se vazio">
            <input
              className={inputCls}
              value={el.fallback}
              placeholder="Não mostrar"
              onChange={(e) => up({ fallback: e.target.value })}
            />
          </Row>
          <Row label="Antes / depois">
            <Pair>
              <input
                aria-label="Prefixo"
                className={inputCls}
                value={el.prefix}
                placeholder="Prefixo"
                onChange={(e) => up({ prefix: e.target.value })}
              />
              <input
                aria-label="Sufixo"
                className={inputCls}
                value={el.suffix}
                placeholder="Sufixo"
                onChange={(e) => up({ suffix: e.target.value })}
              />
            </Pair>
          </Row>
        </Section>
      )}

      {(el.type === "text" || el.type === "field") && (
        <TextStyleSection style={el.style} onChange={upStyle} brand={brand} />
      )}

      {el.type === "qrcode" && (
        <Section title="QR code">
          <FieldSelect value={el.field} onChange={(field) => up({ field })} fields={fields} />
          <Row label="Correção">
            <Segmented
              ariaLabel="Nível de correção de erro"
              value={el.errorCorrection}
              onChange={(errorCorrection) => up({ errorCorrection })}
              options={(["L", "M", "Q", "H"] as const).map((v) => ({
                value: v,
                label: v,
                title: { L: "7%", M: "15%", Q: "25%", H: "30% (com logo)" }[v],
              }))}
            />
          </Row>
          <Row label="Margem">
            <NumberInput
              value={el.quietZone}
              step={1}
              min={0}
              max={8}
              unit="mód."
              onChange={(quietZone) => up({ quietZone })}
            />
          </Row>
          <Row label="Cor">
            <ColorInput
              value={el.color}
              onChange={(color) => up({ color: color ?? "black" })}
              brand={brand}
            />
          </Row>
        </Section>
      )}

      {el.type === "barcode" && (
        <Section title="Código de barras (CODE128)">
          <FieldSelect value={el.field} onChange={(field) => up({ field })} fields={fields} />
          <Toggle
            checked={el.showText}
            onChange={(showText) => up({ showText })}
            label="Mostrar o código abaixo"
          />
          <Row label="Cor">
            <ColorInput
              value={el.color}
              onChange={(color) => up({ color: color ?? "black" })}
              brand={brand}
            />
          </Row>
        </Section>
      )}

      {el.type === "image" && <ImageSection el={el} up={up} fields={fields} tenant={tenant} />}

      {el.type === "box" && (
        <Section title="Caixa / faixa">
          <Row label="Preenchimento">
            <ColorInput value={el.fill} onChange={(fill) => up({ fill })} brand={brand} allowNone />
          </Row>
          <Row label="Borda">
            <ColorInput
              value={el.stroke}
              onChange={(stroke) => up({ stroke })}
              brand={brand}
              allowNone
            />
          </Row>
          <Row label="Espessura / raio">
            <Pair>
              <NumberInput
                ariaLabel="Espessura da borda"
                value={el.strokeWidth}
                step={0.1}
                min={0}
                unit="mm"
                onChange={(strokeWidth) => up({ strokeWidth })}
              />
              <NumberInput
                ariaLabel="Raio"
                value={el.radius}
                step={0.5}
                min={0}
                unit="r"
                onChange={(radius) => up({ radius })}
              />
            </Pair>
          </Row>
          <Row label="Opacidade">
            <NumberInput
              value={Math.round(el.opacity * 100)}
              step={5}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => up({ opacity: v / 100 })}
            />
          </Row>
        </Section>
      )}

      {el.type === "sections" && <SectionsEditor el={el} up={up} brand={brand} />}

      <ConditionSection el={el} up={up} fields={fields} />
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "focus-visible:outline-brand-ring grid size-7 place-items-center rounded-sm transition-colors focus-visible:outline-2 [&_svg]:size-3.5",
        danger ? "text-danger hover:bg-danger-bg" : "text-fg-subtle hover:bg-hover hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function InsertField({
  fields,
  onPick,
}: {
  fields: FieldDefinition[];
  onPick: (k: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Braces className="text-fg-subtle size-3.5 shrink-0" aria-hidden />
      <FieldSelect
        value=""
        allowEmpty="Inserir campo no texto…"
        onChange={(k) => k && onPick(k)}
        fields={fields}
      />
    </div>
  );
}

function TextStyleSection({
  style,
  onChange,
  brand,
}: {
  style: TextStyle;
  onChange: (p: Partial<TextStyle>) => void;
  brand: BrandColors;
}) {
  return (
    <Section title="Texto">
      <Row label="Fonte">
        <Segmented
          ariaLabel="Família"
          value={style.font}
          onChange={(font) => onChange({ font })}
          options={[
            { value: "sans", label: "Sans" },
            { value: "serif", label: <span className="font-serif">Serif</span> },
            { value: "mono", label: <span className="font-mono">Mono</span> },
          ]}
        />
      </Row>
      <Row label="Peso">
        <Segmented
          ariaLabel="Peso"
          value={style.weight}
          onChange={(weight) => onChange({ weight })}
          options={[
            { value: "regular", label: "Regular" },
            { value: "semibold", label: "Semi" },
            { value: "bold", label: "Negrito" },
          ]}
        />
      </Row>
      <Row label="Tamanho">
        <Pair>
          <NumberInput
            ariaLabel="Tamanho"
            value={style.size}
            step={0.5}
            min={4}
            unit="pt"
            onChange={(size) => onChange({ size })}
          />
          <NumberInput
            ariaLabel="Linhas"
            value={style.maxLines}
            step={1}
            min={1}
            max={50}
            unit="lin"
            onChange={(maxLines) => onChange({ maxLines })}
          />
        </Pair>
      </Row>
      <Toggle
        checked={style.autoFit}
        onChange={(autoFit) => onChange({ autoFit })}
        label="Reduzir para caber"
        hint={`Nomes longos encolhem até ${style.minSize} pt em vez de cortar.`}
      />
      {style.autoFit && (
        <Row label="Mínimo">
          <NumberInput
            value={style.minSize}
            step={0.5}
            min={3}
            unit="pt"
            onChange={(minSize) => onChange({ minSize })}
          />
        </Row>
      )}
      <Row label="Alinhamento">
        <Segmented
          ariaLabel="Alinhamento horizontal"
          value={style.align}
          onChange={(align) => onChange({ align })}
          options={[
            { value: "left", label: <AlignLeft />, title: "Esquerda" },
            { value: "center", label: <AlignCenter />, title: "Centro" },
            { value: "right", label: <AlignRight />, title: "Direita" },
          ]}
        />
      </Row>
      <Row label="Vertical">
        <Segmented
          ariaLabel="Alinhamento vertical"
          value={style.valign}
          onChange={(valign) => onChange({ valign })}
          options={[
            { value: "top", label: "Topo" },
            { value: "middle", label: "Meio" },
            { value: "bottom", label: "Base" },
          ]}
        />
      </Row>
      <Row label="Entrelinha / letra">
        <Pair>
          <NumberInput
            ariaLabel="Entrelinha"
            value={style.lineHeight}
            step={0.05}
            min={0.8}
            max={3}
            onChange={(lineHeight) => onChange({ lineHeight })}
          />
          <NumberInput
            ariaLabel="Espaço entre letras"
            value={style.letterSpacing}
            step={0.1}
            min={-2}
            max={10}
            unit="pt"
            onChange={(letterSpacing) => onChange({ letterSpacing })}
          />
        </Pair>
      </Row>
      <Toggle
        checked={style.uppercase}
        onChange={(uppercase) => onChange({ uppercase })}
        label="Caixa alta"
      />
      <Row label="Cor">
        <ColorInput
          value={style.color}
          onChange={(color) => onChange({ color: color ?? "ink" })}
          brand={brand}
        />
      </Row>
      <Row label="Fundo">
        <ColorInput
          value={style.background}
          onChange={(background) => onChange({ background })}
          brand={brand}
          allowNone
        />
      </Row>
      {style.background && (
        <Row label="Raio / respiro">
          <Pair>
            <NumberInput
              ariaLabel="Raio"
              value={style.radius}
              step={0.5}
              min={0}
              unit="r"
              onChange={(radius) => onChange({ radius })}
            />
            <NumberInput
              ariaLabel="Respiro interno"
              value={style.padding}
              step={0.5}
              min={0}
              unit="mm"
              onChange={(padding) => onChange({ padding })}
            />
          </Pair>
        </Row>
      )}
    </Section>
  );
}

function ImageSection({
  el,
  up,
  fields,
  tenant,
}: {
  el: Extract<DocumentElement, { type: "image" }>;
  up: (p: Record<string, unknown>) => void;
  fields: FieldDefinition[];
  tenant: string;
}) {
  const [busy, setBusy] = useState(false);
  const fromField = el.source.kind === "field";
  return (
    <Section title="Imagem">
      <Segmented
        ariaLabel="Origem da imagem"
        value={fromField ? "field" : "file"}
        onChange={(v) =>
          up({
            source:
              v === "field"
                ? { kind: "field", field: "tenant.logo" }
                : { kind: "file", fileId: "pending" },
          })
        }
        options={[
          { value: "field", label: "Dos dados" },
          { value: "file", label: "Arquivo" },
        ]}
      />
      {el.source.kind === "field" ? (
        <FieldSelect
          value={el.source.field}
          onChange={(field) => up({ source: { kind: "field", field } })}
          fields={fields}
          imageOnly
        />
      ) : (
        <label className="border-border-strong hover:bg-hover flex h-9 cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed text-sm">
          <Upload className="size-4" />
          {busy
            ? "Enviando…"
            : el.source.fileId !== "pending"
              ? "Trocar imagem"
              : "Enviar PNG ou JPG"}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              try {
                const { id } = await uploadAsset(tenant, f);
                up({ source: { kind: "file", fileId: id } });
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      )}
      <Row label="Encaixe">
        <Segmented
          ariaLabel="Encaixe"
          value={el.fit}
          onChange={(fit) => up({ fit })}
          options={[
            { value: "contain", label: "Inteira" },
            { value: "cover", label: "Preencher" },
          ]}
        />
      </Row>
      <Row label="Alinhamento">
        <Segmented
          ariaLabel="Alinhamento"
          value={el.align}
          onChange={(align) => up({ align })}
          options={[
            { value: "left", label: <AlignLeft /> },
            { value: "center", label: <AlignCenter /> },
            { value: "right", label: <AlignRight /> },
          ]}
        />
      </Row>
      <Toggle
        checked={el.circle}
        onChange={(circle) => up({ circle })}
        label="Recorte circular"
        hint="Para foto do participante."
      />
    </Section>
  );
}

function SectionsEditor({
  el,
  up,
  brand,
}: {
  el: SectionsElement;
  up: (p: Record<string, unknown>) => void;
  brand: BrandColors;
}) {
  const set = (sections: SectionsElement["sections"]) => up({ sections });
  const missing = VOUCHER_SECTION_KEYS.filter(
    (k) => k === "freeText" || !el.sections.some((s) => s.key === k),
  );
  return (
    <Section title="Seções automáticas">
      <p className="text-fg-subtle -mt-1 text-xs">
        Preenchidas com os voos, a hospedagem e o roteiro do viajante. Se não couber, o voucher
        ganha páginas de continuação.
      </p>
      <ol className="flex flex-col gap-1.5">
        {el.sections.map((s, i) => (
          <li key={i} className="border-border bg-surface rounded-sm border p-2">
            <div className="flex items-center gap-1">
              <span className="flex-1 truncate text-sm font-medium">{SECTION_LABEL[s.key]}</span>
              <IconBtn
                label="Subir"
                onClick={() => {
                  if (i === 0) return;
                  const n = [...el.sections];
                  [n[i - 1], n[i]] = [n[i]!, n[i - 1]!];
                  set(n);
                }}
              >
                <ArrowUp />
              </IconBtn>
              <IconBtn
                label="Descer"
                onClick={() => {
                  if (i === el.sections.length - 1) return;
                  const n = [...el.sections];
                  [n[i + 1], n[i]] = [n[i]!, n[i + 1]!];
                  set(n);
                }}
              >
                <ArrowDown />
              </IconBtn>
              <IconBtn
                label="Remover seção"
                danger
                onClick={() => el.sections.length > 1 && set(el.sections.filter((_, j) => j !== i))}
              >
                <X />
              </IconBtn>
            </div>
            <input
              aria-label="Título da seção"
              className={cn(inputCls, "mt-1.5")}
              placeholder={SECTION_LABEL[s.key]}
              value={s.title ?? ""}
              onChange={(e) =>
                set(
                  el.sections.map((x, j) =>
                    j === i ? { ...x, title: e.target.value || undefined } : x,
                  ),
                )
              }
            />
            {s.key === "freeText" && (
              <textarea
                aria-label="Texto da seção"
                rows={3}
                className={cn(inputCls, "mt-1.5 h-auto py-1.5")}
                placeholder="Aceita campos, como {{person.firstName}}"
                value={s.content ?? ""}
                onChange={(e) =>
                  set(el.sections.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))
                }
              />
            )}
          </li>
        ))}
      </ol>
      {missing.length > 0 && (
        <select
          className={inputCls}
          value=""
          onChange={(e) =>
            e.target.value && set([...el.sections, { key: e.target.value as "freeText" }])
          }
        >
          <option value="">Adicionar seção…</option>
          {missing.map((k) => (
            <option key={k} value={k}>
              {SECTION_LABEL[k]}
            </option>
          ))}
        </select>
      )}
      <Row label="Destaque">
        <ColorInput
          value={el.accent}
          onChange={(accent) => up({ accent: accent ?? "brand" })}
          brand={brand}
        />
      </Row>
    </Section>
  );
}

function ConditionSection({
  el,
  up,
  fields,
}: {
  el: DocumentElement;
  up: (p: Record<string, unknown>) => void;
  fields: FieldDefinition[];
}) {
  const when = el.when ?? {};
  const set = (patch: Record<string, unknown>) => {
    const next = { ...when, ...patch };
    const empty =
      !next.categories?.length && !next.roles?.length && !next.requiresField && !next.unlessField;
    up({ when: empty ? undefined : next });
  };
  const [cat, setCat] = useState("");
  const active = !!el.when;
  return (
    <Section title={active ? "Exibir só quando…" : "Condições"}>
      {!active && (
        <p className="text-fg-subtle -mt-1 text-xs">
          Aparece sempre. Restrinja por categoria ou papel (ex.: faixa “EXPOSITOR”).
        </p>
      )}
      <div>
        <p className="text-fg-muted mb-1.5 text-sm">Categorias</p>
        <div className="flex flex-wrap gap-1">
          {(when.categories ?? []).map((c) => (
            <span
              key={c}
              className="bg-surface-muted inline-flex h-6 items-center gap-1 rounded-full pr-1 pl-2.5 text-xs font-medium"
            >
              {c}
              <button
                type="button"
                aria-label={`Remover ${c}`}
                onClick={() => set({ categories: (when.categories ?? []).filter((x) => x !== c) })}
                className="hover:bg-hover grid size-4 place-items-center rounded-full"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <form
          className="mt-1.5 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const v = cat.trim().toUpperCase();
            if (v && !(when.categories ?? []).includes(v))
              set({ categories: [...(when.categories ?? []), v] });
            setCat("");
          }}
        >
          <input
            className={inputCls}
            placeholder="VISITANTE, EXPOSITOR…"
            value={cat}
            onChange={(e) => setCat(e.target.value)}
          />
          <Button type="submit" size="icon-sm" variant="secondary" aria-label="Adicionar categoria">
            <Plus />
          </Button>
        </form>
      </div>
      <div>
        <p className="text-fg-muted mb-1.5 text-sm">Papéis</p>
        <div className="flex flex-wrap gap-1">
          {ROLES.map((r) => {
            const on = (when.roles ?? []).includes(r.value);
            return (
              <button
                key={r.value}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set({
                    roles: on
                      ? (when.roles ?? []).filter((x) => x !== r.value)
                      : [...(when.roles ?? []), r.value],
                  })
                }
                className={cn(
                  "h-6 rounded-full border px-2.5 text-xs font-medium transition-colors",
                  on
                    ? "border-brand bg-brand-subtle text-brand-subtle-fg"
                    : "border-border-strong text-fg-subtle hover:text-fg",
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
      <Row label="Se preenchido">
        <FieldSelect
          value={when.requiresField ?? ""}
          allowEmpty="—"
          onChange={(v) => set({ requiresField: v || undefined })}
          fields={fields}
        />
      </Row>
      <Row label="Se vazio">
        <FieldSelect
          value={when.unlessField ?? ""}
          allowEmpty="—"
          onChange={(v) => set({ unlessField: v || undefined })}
          fields={[...fields.filter((f) => !f.image), ...fields.filter((f) => f.image)]}
        />
      </Row>
    </Section>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────

export function PageInspector({
  editor,
  brand,
  tenant,
  calibrationHref,
}: {
  editor: Editor;
  brand: BrandColors;
  tenant: string;
  calibrationHref: string;
}) {
  const def: DocumentDefinition = editor.def;
  const p = def.page;
  const presets = PAGE_PRESETS.filter((x) => x.kinds.includes(def.kind));
  const current = PAGE_PRESETS.find((x) => x.width === p.width && x.height === p.height);
  const [busy, setBusy] = useState(false);
  const thermal = def.output === "thermal";

  return (
    <div>
      <Section title="Página">
        <Row label="Formato">
          <select
            className={inputCls}
            value={current?.id ?? "custom"}
            onChange={(e) => {
              const pr = PAGE_PRESETS.find((x) => x.id === e.target.value);
              if (pr) editor.updatePage({ width: pr.width, height: pr.height });
            }}
          >
            {(presets.length ? presets : PAGE_PRESETS).map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.label}
              </option>
            ))}
            {!presets.length && null}
            <option value="custom">Personalizado</option>
          </select>
        </Row>
        <Row label="Tamanho">
          <Pair>
            <NumberInput
              ariaLabel="Largura"
              value={p.width}
              unit="L"
              min={10}
              onChange={(width) => editor.updatePage({ width })}
            />
            <NumberInput
              ariaLabel="Altura"
              value={p.height}
              unit="A"
              min={10}
              onChange={(height) => editor.updatePage({ height })}
            />
          </Pair>
        </Row>
        {current && <p className="text-fg-subtle -mt-1 text-xs">{current.hint}</p>}
        <Row label="Sangria / segurança">
          <Pair>
            <NumberInput
              ariaLabel="Sangria"
              value={p.bleed}
              step={0.5}
              min={0}
              max={10}
              unit="mm"
              onChange={(bleed) => editor.updatePage({ bleed })}
            />
            <NumberInput
              ariaLabel="Margem de segurança"
              value={p.safeMargin}
              step={0.5}
              min={0}
              max={30}
              unit="mm"
              onChange={(safeMargin) => editor.updatePage({ safeMargin })}
            />
          </Pair>
        </Row>
        <Row label="Cor de fundo">
          <ColorInput
            value={p.fill}
            onChange={(fill) => editor.updatePage({ fill })}
            brand={brand}
            allowNone
          />
        </Row>
      </Section>

      <Section title="Arte de fundo">
        {p.background ? (
          <>
            <div className="border-border bg-surface-muted flex items-center justify-between gap-2 rounded-sm border px-2.5 py-2 text-sm">
              <span className="truncate">
                {p.background.kind === "pdf" ? "PDF de fundo" : "Imagem de fundo"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => editor.updatePage({ background: undefined })}
              >
                Remover
              </Button>
            </div>
            {p.background.kind === "pdf" && (
              <Toggle
                checked={p.background.allPages}
                onChange={(allPages) =>
                  editor.updatePage({ background: { ...p.background!, allPages } })
                }
                label="Uma página do documento por página do PDF"
                hint="Desligado: usa só a primeira página como fundo."
              />
            )}
          </>
        ) : (
          <p className="text-fg-subtle -mt-1 text-xs">
            Envie a arte da gráfica (PDF) ou uma imagem: os campos são impressos por cima.
          </p>
        )}
        <label className="border-border-strong hover:bg-hover flex h-9 cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed text-sm">
          <Upload className="size-4" />
          {busy ? "Enviando…" : p.background ? "Trocar arte" : "Enviar PDF, PNG ou JPG"}
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              try {
                const { id, mimeType } = await uploadAsset(tenant, f);
                editor.updatePage({
                  background: {
                    kind: mimeType === "application/pdf" ? "pdf" : "image",
                    fileId: id,
                    allPages: true,
                    continuationPage: null,
                  },
                });
                toast.success("Arte de fundo aplicada.");
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
      </Section>

      <HolesSection holes={p.holes} onChange={(holes) => editor.updatePage({ holes })} page={p} />

      <Section title="Impressão">
        <Row label="Saída">
          <Segmented
            ariaLabel="Saída preferida"
            value={def.output}
            onChange={(output) =>
              editor.updateDef({ output, monochrome: output === "thermal" ? true : def.monochrome })
            }
            options={[
              { value: "pdf", label: "PDF" },
              { value: "thermal", label: "Térmica" },
            ]}
          />
        </Row>
        <Toggle
          checked={def.monochrome}
          onChange={(monochrome) => editor.updateDef({ monochrome })}
          label="Preto e branco"
          hint="Térmicas não imprimem cor: tons viram preto."
        />
        <Row label="Arquivo">
          <input
            className={inputCls}
            value={def.fileName}
            onChange={(e) => editor.updateDef({ fileName: e.target.value })}
            placeholder="cracha-{{person.firstName}}"
          />
        </Row>
        {thermal && (
          <>
            <p className="text-fg-subtle pt-1 text-xs font-semibold">Ajuste da impressora</p>
            <Row label="Rotação">
              <Segmented
                ariaLabel="Rotação na impressão"
                value={p.rotate}
                onChange={(rotate) => editor.updatePage({ rotate })}
                options={[0, 90, 180, 270].map((v) => ({ value: v as 0, label: `${v}°` }))}
              />
            </Row>
            <Row label="Deslocar X / Y">
              <Pair>
                <NumberInput
                  ariaLabel="Deslocamento horizontal"
                  value={p.offsetX}
                  step={0.5}
                  min={-20}
                  max={20}
                  unit="mm"
                  onChange={(offsetX) => editor.updatePage({ offsetX })}
                />
                <NumberInput
                  ariaLabel="Deslocamento vertical"
                  value={p.offsetY}
                  step={0.5}
                  min={-20}
                  max={20}
                  unit="mm"
                  onChange={(offsetY) => editor.updatePage({ offsetY })}
                />
              </Pair>
            </Row>
            <Button variant="secondary" size="sm" asChild>
              <a href={calibrationHref} target="_blank" rel="noreferrer">
                <Printer /> Imprimir página de calibração
              </a>
            </Button>
            <p className="text-fg-subtle text-xs">
              Imprima, meça a borda e a cruz central e corrija o deslocamento. No balcão, abra o
              Chrome com <code className="font-mono">--kiosk-printing</code> para sair sem diálogo.
            </p>
          </>
        )}
      </Section>
    </div>
  );
}

function HolesSection({
  holes,
  onChange,
  page,
}: {
  holes: Hole[];
  onChange: (h: Hole[]) => void;
  page: { width: number; height: number };
}) {
  const set = (i: number, patch: Partial<Hole>) =>
    onChange(holes.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  return (
    <Section
      title="Furos do crachá"
      action={
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange([...holes, { x: page.width / 2, y: 6, diameter: 5, shape: "circle" }])
          }
        >
          <Plus /> Furo
        </Button>
      }
    >
      {holes.length === 0 && (
        <p className="text-fg-subtle -mt-1 text-xs">
          Marque os furos de cordão: o editor avisa se algo cair em cima.
        </p>
      )}
      {holes.map((h, i) => (
        <div key={i} className="border-border flex flex-col gap-1.5 rounded-sm border p-2">
          <div className="flex items-center justify-between">
            <Segmented
              ariaLabel="Formato do furo"
              value={h.shape}
              onChange={(shape) => set(i, { shape })}
              options={[
                { value: "circle", label: "Redondo" },
                { value: "slot", label: "Oblongo" },
              ]}
            />
            <IconBtn
              label="Remover furo"
              danger
              onClick={() => onChange(holes.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </IconBtn>
          </div>
          <Pair>
            <NumberInput
              ariaLabel="Centro X"
              value={h.x}
              unit="x"
              onChange={(x) => set(i, { x })}
            />
            <NumberInput
              ariaLabel="Centro Y"
              value={h.y}
              unit="y"
              onChange={(y) => set(i, { y })}
            />
          </Pair>
          <Pair>
            <NumberInput
              ariaLabel="Diâmetro"
              value={h.diameter}
              unit="ø"
              min={1}
              onChange={(diameter) => set(i, { diameter })}
            />
            {h.shape === "slot" ? (
              <NumberInput
                ariaLabel="Largura"
                value={h.width ?? h.diameter * 3}
                unit="L"
                min={1}
                onChange={(width) => set(i, { width })}
              />
            ) : (
              <span />
            )}
          </Pair>
        </div>
      ))}
    </Section>
  );
}
