"use client";

import { useEffect, useRef, useState } from "react";
import type { DocumentDefinitionInput } from "@mais/core";
import { cn } from "@/lib/cn";

/** 1 mm em pixels CSS (96 dpi). */
export const MM = 96 / 25.4;

// ── Arte de fundo em PDF (pdf.js, só no navegador) ──────────────────────────

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
};

const pdfCache = new Map<string, Promise<PdfDoc>>();

export function loadPdf(url: string): Promise<PdfDoc> {
  let p = pdfCache.get(url);
  if (!p) {
    p = import("pdfjs-dist").then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return (await pdfjs.getDocument({ url, withCredentials: true }).promise) as unknown as PdfDoc;
    });
    pdfCache.set(url, p);
  }
  return p;
}

function PdfBackground({
  url,
  pageIndex,
  widthPx,
  heightPx,
}: {
  url: string;
  pageIndex: number;
  widthPx: number;
  heightPx: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const doc = await loadPdf(url);
        if (pageIndex >= doc.numPages) return;
        const page = await doc.getPage(pageIndex + 1);
        const base = page.getViewport({ scale: 1 });
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale: (widthPx / base.width) * ratio });
        const c = canvas.current;
        if (!c || cancelled) return;
        c.width = viewport.width;
        c.height = viewport.height;
        const ctx = c.getContext("2d");
        if (ctx) await page.render({ canvasContext: ctx, viewport }).promise;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, pageIndex, widthPx]);
  if (failed) return null;
  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ width: widthPx, height: heightPx }}
    />
  );
}

// ── Página renderizada pelo motor ──────────────────────────────────────────

type PreviewState = { html: string; pageCount: number } | null;

/**
 * Página do documento em escala: a arte de fundo por baixo e, por cima, o HTML
 * que o MESMO motor do PDF e da impressão térmica gera. Atualiza com atraso
 * curto enquanto a definição muda (o editor não trava ao digitar).
 */
export function PagePreview({
  tenant,
  definition,
  page = 0,
  registrationId,
  scale,
  className,
  onPageCount,
  lazy = false,
  children,
}: {
  tenant: string;
  definition: DocumentDefinitionInput;
  page?: number;
  registrationId?: string | null;
  /** pixels por mm */
  scale: number;
  className?: string;
  onPageCount?: (n: number) => void;
  /** só carrega quando entra na tela (biblioteca) */
  lazy?: boolean;
  children?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [state, setState] = useState<PreviewState>(null);
  const [error, setError] = useState(false);
  const key = JSON.stringify(definition);

  useEffect(() => {
    if (!lazy || visible) return;
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [lazy, visible]);

  useEffect(() => {
    if (!visible) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/documents/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenant, definition: JSON.parse(key), page, registrationId }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = (await res.json()) as { html: string; pageCount: number };
        setError(false);
        setState(data);
        onPageCount?.(data.pageCount);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // onPageCount é estável o bastante; não queremos refazer a busca por ele
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, key, page, registrationId, visible]);

  const def = definition;
  const w = def.page.width * scale;
  const h = def.page.height * scale;
  const bg = def.page.background;
  const bgUrl = bg ? `/api/documents/assets/${bg.fileId}` : null;
  const bgPage = bg?.kind === "pdf" ? (bg.allPages === false ? 0 : page) : 0;

  return (
    <div
      ref={box}
      className={cn("relative overflow-hidden bg-white", className)}
      style={{ width: w, height: h }}
    >
      {def.page.fill && def.page.fill.startsWith("#") && (
        <div aria-hidden className="absolute inset-0" style={{ background: def.page.fill }} />
      )}
      {bgUrl && bg?.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={bgUrl} className="pointer-events-none absolute inset-0 size-full" />
      )}
      {bgUrl && bg?.kind === "pdf" && (
        <PdfBackground url={bgUrl} pageIndex={bgPage} widthPx={w} heightPx={h} />
      )}
      {state && (
        <iframe
          title="Pré-visualização do documento"
          srcDoc={state.html}
          tabIndex={-1}
          aria-hidden
          sandbox="allow-same-origin"
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
          style={{
            width: def.page.width * MM,
            height: def.page.height * MM,
            transform: `scale(${scale / MM})`,
          }}
        />
      )}
      {!state && !error && (
        <div aria-hidden className="bg-surface-muted absolute inset-0 animate-pulse" />
      )}
      {error && !state && (
        <div className="text-fg-subtle absolute inset-0 grid place-items-center p-2 text-center text-xs">
          Não foi possível desenhar a pré-visualização.
        </div>
      )}
      {children}
    </div>
  );
}
