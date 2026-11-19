"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Braces, Link2, Search } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FIELD_CONTEXT_LABELS,
  MESSAGE_FIELDS,
  type FieldContextKind,
  type MessageFieldDefinition,
} from "@mais/core/messaging";
import { Button } from "@/components/ui";
import { controlClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";

/**
 * Editor de texto com campos dinâmicos como "chips".
 *
 * O valor é texto puro com marcadores {{campo}} (o formato que o motor
 * renderiza); na tela, cada marcador vira uma etiqueta não editável com o
 * nome do campo em português. Colar sempre entra como texto simples.
 */

const FIELD_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
const BY_KEY = new Map(MESSAGE_FIELDS.map((f) => [f.key, f]));

export type FieldEditorHandle = { insertField: (key: string) => void; focus: () => void };

function chipNode(key: string): HTMLSpanElement {
  const f = BY_KEY.get(key);
  const el = document.createElement("span");
  el.contentEditable = "false";
  el.dataset.field = key;
  el.className = cn(
    "mx-px inline-flex h-[1.45em] items-center rounded-xs border px-1.5 align-baseline text-[0.86em] leading-none font-medium select-none",
    f
      ? "border-brand/20 bg-brand-subtle text-brand-subtle-fg"
      : "border-danger-border bg-danger-bg text-danger",
  );
  el.textContent = f?.label ?? key;
  el.title = f ? `{{${key}}}` : `Campo desconhecido: {{${key}}}`;
  return el;
}

function paint(root: HTMLElement, value: string) {
  root.replaceChildren();
  let last = 0;
  for (const m of value.matchAll(FIELD_RE)) {
    const i = m.index ?? 0;
    if (i > last) root.append(document.createTextNode(value.slice(last, i)));
    root.append(chipNode((m[1] ?? "").toLowerCase()));
    last = i + m[0].length;
  }
  if (last < value.length) root.append(document.createTextNode(value.slice(last)));
}

function serialize(node: Node): string {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += n.nodeValue ?? "";
    else if (n instanceof HTMLElement) {
      if (n.dataset.field) out += `{{${n.dataset.field}}}`;
      else if (n.tagName === "BR") out += "\n";
      else if (n.tagName === "DIV" || n.tagName === "P") out += (out ? "\n" : "") + serialize(n);
      else out += serialize(n);
    }
  });
  return out;
}

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  /** Rótulo acessível quando não há <label for> */
  ariaLabel?: string;
};

export const FieldEditor = forwardRef<FieldEditorHandle, Props>(function FieldEditor(
  {
    id,
    value,
    onChange,
    multiline = true,
    placeholder,
    invalid,
    describedBy,
    className,
    ariaLabel,
  },
  ref,
) {
  const root = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  const range = useRef<Range | null>(null);

  // Repinta só quando o valor muda de fora (modelo carregado, sugestão aplicada)
  useEffect(() => {
    if (root.current && value !== emitted.current) {
      paint(root.current, value);
      emitted.current = value;
    }
  }, [value]);

  const emit = useCallback(() => {
    if (!root.current) return;
    let v = serialize(root.current);
    if (!multiline) v = v.replace(/\n/g, " ");
    emitted.current = v;
    onChange(v);
  }, [multiline, onChange]);

  const remember = () => {
    const sel = window.getSelection();
    if (sel?.rangeCount && root.current?.contains(sel.anchorNode)) {
      range.current = sel.getRangeAt(0).cloneRange();
    }
  };

  useImperativeHandle(ref, () => ({
    focus: () => root.current?.focus(),
    insertField(key: string) {
      const el = root.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      let r = range.current;
      if (!r || !el.contains(r.startContainer)) {
        r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
      }
      r.deleteContents();
      const chip = chipNode(key);
      const space = document.createTextNode(" ");
      r.insertNode(space);
      r.insertNode(chip);
      r.setStartAfter(space);
      r.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(r);
      range.current = r.cloneRange();
      emit();
    },
  }));

  return (
    <div
      ref={root}
      id={id}
      role="textbox"
      aria-multiline={multiline}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder}
      onInput={emit}
      onKeyUp={remember}
      onMouseUp={remember}
      onBlur={remember}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") e.preventDefault();
      }}
      className={cn(
        controlClass,
        "px-3 py-2 break-words whitespace-pre-wrap outline-none",
        "empty:before:text-fg-faint empty:before:pointer-events-none empty:before:content-[attr(data-placeholder)]",
        multiline ? "min-h-40 leading-relaxed" : "min-h-9 leading-6",
        className,
      )}
    />
  );
});

/** Botão "Inserir campo" com busca, agrupado por contexto. */
export function FieldPicker({
  onPick,
  contexts,
  fields = MESSAGE_FIELDS,
  className,
}: {
  onPick: (key: string) => void;
  contexts?: FieldContextKind[];
  /** Campos oferecidos (padrão: todos). O editor passa só os que o projeto/cliente tem. */
  fields?: readonly MessageFieldDefinition[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const term = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const match = (f: MessageFieldDefinition) =>
      !term ||
      f.label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(term) ||
      f.key.includes(term);
    const out = new Map<FieldContextKind, MessageFieldDefinition[]>();
    for (const f of fields) {
      if (contexts && !contexts.includes(f.context)) continue;
      if (!match(f)) continue;
      out.set(f.context, [...(out.get(f.context) ?? []), f]);
    }
    return [...out];
  }, [q, contexts, fields]);

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={className}
          // Mantém a seleção do editor ao clicar no botão
          onMouseDown={(e) => e.preventDefault()}
        >
          <Braces /> Inserir campo
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="bg-surface-raised shadow-pop animate-rise z-50 flex max-h-[min(420px,var(--radix-popover-content-available-height))] w-[min(340px,calc(100vw-32px))] flex-col overflow-hidden rounded-md"
        >
          <div className="border-border border-b p-2">
            <div className="relative">
              <Search className="text-fg-subtle pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar campo"
                className="placeholder:text-fg-faint h-8 w-full rounded-sm bg-transparent pr-2 pl-8 text-base outline-none"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto p-1">
            {groups.length === 0 && (
              <p className="text-fg-subtle px-3 py-6 text-center text-sm">
                Nenhum campo com esse nome.
              </p>
            )}
            {groups.map(([ctx, fields]) => (
              <div key={ctx} className="pb-1">
                <p className="text-fg-subtle px-2.5 pt-2 pb-1 text-xs font-medium">
                  {FIELD_CONTEXT_LABELS[ctx]}
                </p>
                {fields.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onPick(f.key);
                      setOpen(false);
                      setQ("");
                    }}
                    className="hover:bg-hover focus-visible:bg-hover flex w-full items-start gap-2.5 rounded-sm px-2.5 py-1.5 text-left outline-none"
                  >
                    {f.isLink ? (
                      <Link2 className="text-fg-subtle mt-0.5 size-3.5 shrink-0" />
                    ) : (
                      <Braces className="text-fg-subtle mt-0.5 size-3.5 shrink-0" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{f.label}</span>
                      <span className="text-fg-subtle block truncate text-xs">{f.example}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
