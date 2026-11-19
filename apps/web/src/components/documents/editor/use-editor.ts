"use client";

import { useCallback, useMemo, useReducer } from "react";
import type { DocumentDefinition, DocumentElement, ElementType, PageSetup } from "@mais/core";

/**
 * Estado do editor: definição + seleção + histórico (desfazer/refazer).
 * Arrastar e redimensionar usam `preview` (sem gravar no histórico a cada
 * pixel) e `commit` ao soltar — um único passo de desfazer por gesto.
 */

type State = {
  def: DocumentDefinition;
  /** definição de antes do gesto em andamento (arrastar/redimensionar) */
  gestureBase: DocumentDefinition | null;
  past: DocumentDefinition[];
  future: DocumentDefinition[];
  selected: string[];
  page: number;
};

type Action =
  | { type: "set"; def: DocumentDefinition; record?: boolean }
  | { type: "gesture-start" }
  | { type: "gesture-move"; def: DocumentDefinition }
  | { type: "gesture-end" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; ids: string[] }
  | { type: "page"; page: number }
  | { type: "reset"; def: DocumentDefinition };

const LIMIT = 120;

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "set":
      if (a.record === false) return { ...s, def: a.def };
      return { ...s, def: a.def, past: [...s.past, s.def].slice(-LIMIT), future: [] };
    case "gesture-start":
      return { ...s, gestureBase: s.def };
    case "gesture-move":
      return { ...s, def: a.def };
    case "gesture-end": {
      if (!s.gestureBase) return s;
      if (JSON.stringify(s.gestureBase.elements) === JSON.stringify(s.def.elements))
        return { ...s, gestureBase: null };
      return {
        ...s,
        gestureBase: null,
        past: [...s.past, s.gestureBase].slice(-LIMIT),
        future: [],
      };
    }
    case "undo": {
      const prev = s.past.at(-1);
      if (!prev) return s;
      return { ...s, def: prev, past: s.past.slice(0, -1), future: [s.def, ...s.future] };
    }
    case "redo": {
      const next = s.future[0];
      if (!next) return s;
      return { ...s, def: next, past: [...s.past, s.def], future: s.future.slice(1) };
    }
    case "select":
      return { ...s, selected: a.ids };
    case "page":
      return { ...s, page: a.page, selected: [] };
    case "reset":
      return { ...s, def: a.def, past: [], future: [], selected: [], gestureBase: null };
  }
}

export const uid = () => `el_${Math.random().toString(36).slice(2, 9)}`;

const round = (n: number) => Math.round(n * 100) / 100;

export function useEditor(initial: DocumentDefinition) {
  const [s, dispatch] = useReducer(reducer, {
    def: initial,
    gestureBase: null,
    past: [],
    future: [],
    selected: [],
    page: 0,
  });

  const set = useCallback(
    (def: DocumentDefinition, record = true) => dispatch({ type: "set", def, record }),
    [],
  );

  const ops = useMemo(() => {
    const mapEls = (fn: (el: DocumentElement) => DocumentElement, ids?: string[]) => {
      const target = new Set(ids ?? s.selected);
      return { ...s.def, elements: s.def.elements.map((el) => (target.has(el.id) ? fn(el) : el)) };
    };
    return {
      updateElement(id: string, patch: Record<string, unknown>) {
        set(mapEls((el) => ({ ...el, ...patch }) as DocumentElement, [id]));
      },
      updateStyle(id: string, patch: Record<string, unknown>) {
        set(
          mapEls((el) => {
            if (!("style" in el)) return el;
            return { ...el, style: { ...el.style, ...patch } } as DocumentElement;
          }, [id]),
        );
      },
      updatePage(patch: Partial<PageSetup>) {
        set({ ...s.def, page: { ...s.def.page, ...patch } });
      },
      updateDef(patch: Partial<DocumentDefinition>) {
        set({ ...s.def, ...patch });
      },
      add(el: DocumentElement) {
        set({ ...s.def, elements: [...s.def.elements, el] });
        dispatch({ type: "select", ids: [el.id] });
      },
      remove(ids = s.selected) {
        if (!ids.length) return;
        const kill = new Set(ids);
        set({ ...s.def, elements: s.def.elements.filter((el) => !kill.has(el.id)) });
        dispatch({ type: "select", ids: [] });
      },
      duplicate(ids = s.selected) {
        const src = s.def.elements.filter((el) => ids.includes(el.id));
        if (!src.length) return;
        const copies = src.map(
          (el) =>
            ({
              ...structuredClone(el),
              id: uid(),
              label: el.label ? `${el.label} (cópia)` : "",
              x: round(el.x + 2),
              y: round(el.y + 2),
            }) as DocumentElement,
        );
        set({ ...s.def, elements: [...s.def.elements, ...copies] });
        dispatch({ type: "select", ids: copies.map((c) => c.id) });
      },
      nudge(dx: number, dy: number) {
        if (!s.selected.length) return;
        set(mapEls((el) => ({ ...el, x: round(el.x + dx), y: round(el.y + dy) })));
      },
      /** frente/trás na ordem de desenho (o último fica por cima) */
      reorder(id: string, dir: "front" | "back" | "up" | "down") {
        const els = [...s.def.elements];
        const i = els.findIndex((e) => e.id === id);
        if (i < 0) return;
        const [el] = els.splice(i, 1);
        if (!el) return;
        const to =
          dir === "front" ? els.length : dir === "back" ? 0 : dir === "up" ? i + 1 : Math.max(0, i - 1);
        els.splice(Math.min(to, els.length), 0, el);
        set({ ...s.def, elements: els });
      },
      align(mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") {
        const sel = s.def.elements.filter((e) => s.selected.includes(e.id));
        if (!sel.length) return;
        // Um elemento: alinha à página. Vários: alinha ao conjunto.
        const box =
          sel.length === 1
            ? { x: 0, y: 0, w: s.def.page.width, h: s.def.page.height }
            : (() => {
                const r = sel.map(rectOf);
                const x = Math.min(...r.map((q) => q.x));
                const y = Math.min(...r.map((q) => q.y));
                return {
                  x,
                  y,
                  w: Math.max(...r.map((q) => q.x + q.w)) - x,
                  h: Math.max(...r.map((q) => q.y + q.h)) - y,
                };
              })();
        set(
          mapEls((el) => {
            const r = rectOf(el);
            const x =
              mode === "left"
                ? box.x
                : mode === "hcenter"
                  ? box.x + (box.w - r.w) / 2
                  : mode === "right"
                    ? box.x + box.w - r.w
                    : el.x;
            const y =
              mode === "top"
                ? box.y
                : mode === "vcenter"
                  ? box.y + (box.h - r.h) / 2
                  : mode === "bottom"
                    ? box.y + box.h - r.h
                    : el.y;
            return { ...el, x: round(x), y: round(y) };
          }),
        );
      },
    };
  }, [s.def, s.selected, set]);

  return {
    def: s.def,
    selected: s.selected,
    page: s.page,
    canUndo: s.past.length > 0,
    canRedo: s.future.length > 0,
    select: (ids: string[]) => dispatch({ type: "select", ids }),
    setPage: (page: number) => dispatch({ type: "page", page }),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    reset: (def: DocumentDefinition) => dispatch({ type: "reset", def }),
    gestureStart: () => dispatch({ type: "gesture-start" }),
    gestureMove: (def: DocumentDefinition) => dispatch({ type: "gesture-move", def }),
    gestureEnd: () => dispatch({ type: "gesture-end" }),
    set,
    ...ops,
  };
}

export type Editor = ReturnType<typeof useEditor>;

export function rectOf(el: DocumentElement) {
  if (el.type === "qrcode") return { x: el.x, y: el.y, w: el.size, h: el.size };
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}

export const ELEMENT_LABEL: Record<ElementType, string> = {
  text: "Texto",
  field: "Campo",
  qrcode: "QR code",
  barcode: "Código de barras",
  image: "Imagem",
  box: "Caixa",
  sections: "Seções do voucher",
};

export function elementName(el: DocumentElement, fieldLabel?: (k: string) => string | undefined) {
  if (el.label) return el.label;
  if (el.type === "field") return fieldLabel?.(el.field) ?? el.field;
  if (el.type === "text") return el.text.slice(0, 40) || "Texto";
  return ELEMENT_LABEL[el.type];
}
