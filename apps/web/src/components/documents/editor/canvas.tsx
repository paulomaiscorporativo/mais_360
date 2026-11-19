"use client";

import { useRef, useState } from "react";
import type { DocumentDefinition, DocumentElement } from "@mais/core";
import { cn } from "@/lib/cn";
import { PagePreview } from "../page-preview";
import { rectOf, type Editor } from "./use-editor";

const RULER = 22; // px

type Guide = { axis: "x" | "y"; at: number };
type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const round = (n: number, step = 0.1) => Math.round(n / step) * step;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function EditorCanvas({
  editor,
  tenant,
  registrationId,
  scale,
  grid,
  gridMm,
  snap,
  guides,
  warned,
  readOnly,
  onPageCount,
  elementName,
}: {
  editor: Editor;
  tenant: string;
  registrationId: string | null;
  /** px por mm */
  scale: number;
  grid: boolean;
  gridMm: number;
  snap: boolean;
  guides: boolean;
  warned: Set<string>;
  readOnly: boolean;
  onPageCount: (n: number) => void;
  elementName: (el: DocumentElement) => string;
}) {
  const { def, page, selected } = editor;
  const p = def.page;
  const w = p.width * scale;
  const h = p.height * scale;
  const [snapLines, setSnapLines] = useState<Guide[]>([]);
  const gesture = useRef<{
    kind: "move" | "resize";
    handle?: Handle;
    startX: number;
    startY: number;
    origin: Map<string, { x: number; y: number; w: number; h: number }>;
    primary: string;
    base: DocumentDefinition;
    moved: boolean;
  } | null>(null);

  const onPage = def.elements.filter((el) => el.page === page && !el.hidden);

  // ── snapping ────────────────────────────────────────────────────────────
  function targets(exclude: Set<string>) {
    const xs = [0, p.width / 2, p.width];
    const ys = [0, p.height / 2, p.height];
    if (p.safeMargin > 0) {
      xs.push(p.safeMargin, p.width - p.safeMargin);
      ys.push(p.safeMargin, p.height - p.safeMargin);
    }
    for (const el of onPage) {
      if (exclude.has(el.id)) continue;
      const r = rectOf(el);
      xs.push(r.x, r.x + r.w / 2, r.x + r.w);
      ys.push(r.y, r.y + r.h / 2, r.y + r.h);
    }
    return { xs, ys };
  }

  function snapValue(edges: number[], candidates: number[], threshold: number) {
    let best: { delta: number; at: number } | null = null;
    for (const e of edges)
      for (const c of candidates) {
        const d = c - e;
        if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta)))
          best = { delta: d, at: c };
      }
    return best;
  }

  // ── gestos ─────────────────────────────────────────────────────────────
  function begin(e: React.PointerEvent, el: DocumentElement, handle?: Handle) {
    if (readOnly || e.button !== 0) return;
    e.stopPropagation();
    let sel = selected;
    if (!handle) {
      if (e.shiftKey) {
        sel = selected.includes(el.id) ? selected.filter((i) => i !== el.id) : [...selected, el.id];
        editor.select(sel);
        if (!sel.includes(el.id)) return;
      } else if (!selected.includes(el.id)) {
        sel = [el.id];
        editor.select(sel);
      }
    }
    const origin = new Map(
      def.elements.filter((x) => sel.includes(x.id)).map((x) => [x.id, rectOf(x)]),
    );
    gesture.current = {
      kind: handle ? "resize" : "move",
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origin,
      primary: el.id,
      base: def,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    let dx = (e.clientX - g.startX) / scale;
    let dy = (e.clientY - g.startY) / scale;
    if (!g.moved) {
      if (Math.abs(dx) * scale < 2 && Math.abs(dy) * scale < 2) return;
      g.moved = true;
      editor.gestureStart();
    }
    const threshold = 6 / scale;
    const lines: Guide[] = [];
    const o = g.origin.get(g.primary);
    if (!o) return;

    if (g.kind === "move") {
      if (snap && !e.altKey) {
        const t = targets(new Set(g.origin.keys()));
        const sx = snapValue([o.x + dx, o.x + dx + o.w / 2, o.x + dx + o.w], t.xs, threshold);
        const sy = snapValue([o.y + dy, o.y + dy + o.h / 2, o.y + dy + o.h], t.ys, threshold);
        if (sx) {
          dx += sx.delta;
          lines.push({ axis: "x", at: sx.at });
        } else if (grid) dx = round(o.x + dx, gridMm) - o.x;
        if (sy) {
          dy += sy.delta;
          lines.push({ axis: "y", at: sy.at });
        } else if (grid) dy = round(o.y + dy, gridMm) - o.y;
      }
      const els = g.base.elements.map((el) => {
        const start = g.origin.get(el.id);
        return start ? ({ ...el, x: r2(start.x + dx), y: r2(start.y + dy) } as DocumentElement) : el;
      });
      editor.gestureMove({ ...g.base, elements: els });
    } else {
      const hd = g.handle ?? "se";
      let { x, y, w: rw, h: rh } = o;
      if (hd.includes("e")) rw = o.w + dx;
      if (hd.includes("s")) rh = o.h + dy;
      if (hd.includes("w")) {
        x = o.x + dx;
        rw = o.w - dx;
      }
      if (hd.includes("n")) {
        y = o.y + dy;
        rh = o.h - dy;
      }
      if (snap && !e.altKey) {
        const t = targets(new Set([g.primary]));
        const edgeX = hd.includes("w") ? x : hd.includes("e") ? x + rw : null;
        const edgeY = hd.includes("n") ? y : hd.includes("s") ? y + rh : null;
        if (edgeX !== null) {
          const sx = snapValue([edgeX], t.xs, threshold);
          const nx = sx ? sx.at : grid ? round(edgeX, gridMm) : edgeX;
          if (sx) lines.push({ axis: "x", at: sx.at });
          if (hd.includes("w")) {
            rw += x - nx;
            x = nx;
          } else rw = nx - x;
        }
        if (edgeY !== null) {
          const sy = snapValue([edgeY], t.ys, threshold);
          const ny = sy ? sy.at : grid ? round(edgeY, gridMm) : edgeY;
          if (sy) lines.push({ axis: "y", at: sy.at });
          if (hd.includes("n")) {
            rh += y - ny;
            y = ny;
          } else rh = ny - y;
        }
      }
      rw = Math.max(2, rw);
      rh = Math.max(2, rh);
      const els = g.base.elements.map((el) => {
        if (el.id !== g.primary) return el;
        if (el.type === "qrcode") {
          const size = r2(Math.max(rw, rh));
          return { ...el, x: r2(hd.includes("w") ? o.x + o.w - size : x), y: r2(hd.includes("n") ? o.y + o.h - size : y), size };
        }
        return { ...el, x: r2(x), y: r2(y), w: r2(rw), h: r2(rh) } as DocumentElement;
      });
      editor.gestureMove({ ...g.base, elements: els });
    }
    setSnapLines(lines);
  }

  function end() {
    if (gesture.current?.moved) editor.gestureEnd();
    gesture.current = null;
    setSnapLines([]);
  }

  // ── régua ──────────────────────────────────────────────────────────────
  const step = scale >= 6 ? 1 : scale >= 3 ? 2 : 5;
  const ticks = (len: number) => {
    const out: { mm: number; size: number; label?: string }[] = [];
    for (let mm = 0; mm <= len; mm += step) {
      const major = mm % 10 === 0;
      const mid = mm % 5 === 0;
      out.push({
        mm,
        size: major ? 10 : mid ? 6 : 3,
        label: major && (scale >= 2 || mm % 50 === 0) ? String(mm) : undefined,
      });
    }
    return out;
  };

  const sel1 = selected.length === 1 ? def.elements.find((e) => e.id === selected[0]) : undefined;

  return (
    <div className="relative inline-block" style={{ paddingLeft: RULER, paddingTop: RULER }}>
      {/* réguas */}
      <svg
        aria-hidden
        className="text-fg-faint absolute top-0"
        style={{ left: RULER, width: w, height: RULER }}
      >
        {ticks(p.width).map((t) => (
          <g key={t.mm}>
            <line x1={t.mm * scale} x2={t.mm * scale} y1={RULER} y2={RULER - t.size} stroke="currentColor" />
            {t.label && (
              <text x={t.mm * scale + 2} y={9} fontSize={9} fill="currentColor" className="font-mono">
                {t.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      <svg
        aria-hidden
        className="text-fg-faint absolute left-0"
        style={{ top: RULER, width: RULER, height: h }}
      >
        {ticks(p.height).map((t) => (
          <g key={t.mm}>
            <line y1={t.mm * scale} y2={t.mm * scale} x1={RULER} x2={RULER - t.size} stroke="currentColor" />
            {t.label && (
              <text
                x={9}
                y={t.mm * scale + 2}
                fontSize={9}
                fill="currentColor"
                className="font-mono"
                transform={`rotate(-90 9 ${t.mm * scale + 2})`}
                textAnchor="end"
              >
                {t.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      <div className="relative" style={{ width: w, height: h }}>
        {guides && p.bleed > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute border border-dashed border-rose-400/80"
            style={{
              left: -p.bleed * scale,
              top: -p.bleed * scale,
              width: w + 2 * p.bleed * scale,
              height: h + 2 * p.bleed * scale,
            }}
          />
        )}
        <PagePreview
          tenant={tenant}
          definition={def}
          page={page}
          registrationId={registrationId}
          scale={scale}
          onPageCount={onPageCount}
          className="shadow-[0_1px_2px_rgba(11,26,43,.08),0_8px_24px_-8px_rgba(11,26,43,.18)] ring-1 ring-black/5"
        >
          {/* clique no vazio desmarca */}
          <div
            className="absolute inset-0"
            onPointerDown={() => !readOnly && editor.select([])}
            style={
              grid
                ? {
                    backgroundImage:
                      "linear-gradient(to right, rgba(37,99,235,.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(37,99,235,.10) 1px, transparent 1px)",
                    backgroundSize: `${gridMm * scale}px ${gridMm * scale}px`,
                  }
                : undefined
            }
          />
          {guides && p.safeMargin > 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute border border-dashed border-emerald-500/70"
              style={{
                left: p.safeMargin * scale,
                top: p.safeMargin * scale,
                width: (p.width - 2 * p.safeMargin) * scale,
                height: (p.height - 2 * p.safeMargin) * scale,
              }}
            />
          )}
          {guides &&
            p.holes.map((hole, i) => {
              const hw = hole.shape === "slot" ? (hole.width ?? hole.diameter * 3) : hole.diameter;
              return (
                <div
                  key={i}
                  aria-hidden
                  className="pointer-events-none absolute border border-sky-500 bg-sky-500/15"
                  style={{
                    left: (hole.x - hw / 2) * scale,
                    top: (hole.y - hole.diameter / 2) * scale,
                    width: hw * scale,
                    height: hole.diameter * scale,
                    borderRadius: hole.diameter * scale,
                  }}
                />
              );
            })}

          {onPage.map((el) => {
            const r = rectOf(el);
            const isSel = selected.includes(el.id);
            const warn = warned.has(el.id);
            return (
              <div
                key={el.id}
                role="button"
                tabIndex={-1}
                aria-label={elementName(el)}
                aria-pressed={isSel}
                onPointerDown={(e) => begin(e, el)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                className={cn(
                  "group/el absolute outline-offset-0 transition-[outline-color] duration-100",
                  readOnly ? "cursor-default" : "cursor-move",
                  isSel
                    ? "outline-brand outline-2"
                    : warn
                      ? "outline-1 outline-amber-500 outline-dashed"
                      : "hover:outline-brand/60 outline-1 outline-transparent hover:outline-dashed",
                )}
                style={{ left: r.x * scale, top: r.y * scale, width: r.w * scale, height: r.h * scale }}
              >
                {isSel && selected.length === 1 && (
                  <span className="bg-brand text-brand-fg pointer-events-none absolute -top-5 left-0 max-w-[220px] truncate rounded-t-sm px-1.5 text-[10px] leading-5 font-medium whitespace-nowrap">
                    {elementName(el)}
                  </span>
                )}
              </div>
            );
          })}

          {sel1 && sel1.page === page && !readOnly && (
            <ResizeHandles
              el={sel1}
              scale={scale}
              onDown={(e, hd) => begin(e, sel1, hd)}
              onMove={move}
              onUp={end}
            />
          )}

          {snapLines.map((g, i) =>
            g.axis === "x" ? (
              <div
                key={i}
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-fuchsia-500"
                style={{ left: g.at * scale }}
              />
            ) : (
              <div
                key={i}
                aria-hidden
                className="pointer-events-none absolute right-0 left-0 h-px bg-fuchsia-500"
                style={{ top: g.at * scale }}
              />
            ),
          )}
        </PagePreview>
      </div>
    </div>
  );
}

function ResizeHandles({
  el,
  scale,
  onDown,
  onMove,
  onUp,
}: {
  el: DocumentElement;
  scale: number;
  onDown: (e: React.PointerEvent, h: Handle) => void;
  onMove: (e: React.PointerEvent) => void;
  onUp: () => void;
}) {
  const r = rectOf(el);
  const corners: Handle[] = ["nw", "ne", "sw", "se"];
  const handles: Handle[] = el.type === "qrcode" ? corners : [...corners, "n", "s", "e", "w"];
  const pos = (hd: Handle) => ({
    left: (hd.includes("w") ? r.x : hd.includes("e") ? r.x + r.w : r.x + r.w / 2) * scale - 5,
    top: (hd.includes("n") ? r.y : hd.includes("s") ? r.y + r.h : r.y + r.h / 2) * scale - 5,
  });
  const cursor: Record<Handle, string> = {
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    nw: "nwse-resize",
    se: "nwse-resize",
  };
  return (
    <>
      {handles.map((hd) => (
        <span
          key={hd}
          aria-hidden
          onPointerDown={(e) => onDown(e, hd)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="border-brand absolute z-10 size-2.5 rounded-[2px] border-[1.5px] bg-white shadow-sm"
          style={{ ...pos(hd), cursor: cursor[hd] }}
        />
      ))}
    </>
  );
}
