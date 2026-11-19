"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowLeft,
  Barcode,
  Braces,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FileDown,
  Grid3x3,
  History,
  Image as ImageIcon,
  LayoutList,
  Magnet,
  Maximize,
  Minus,
  Monitor,
  Plus,
  Printer,
  QrCode,
  Redo2,
  RotateCcw,
  Ruler,
  Square,
  TriangleAlert,
  Type,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import {
  fieldsForKind,
  getField,
  validateLayout,
  type DocumentDefinition,
  type DocumentElement,
  type ElementType,
  type LayoutWarning,
} from "@mais/core";
import { Badge, Button } from "@/components/ui";
import { Sheet } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { KIND_UI, formatSize } from "../kinds";
import { MM, PagePreview } from "../page-preview";
import { EditorCanvas } from "./canvas";
import { Toggle, type BrandColors } from "./controls";
import { ElementInspector, PageInspector } from "./inspector";
import { ELEMENT_LABEL, elementName as baseName, uid, useEditor } from "./use-editor";

export type TemplateVersion = { id: string; version: number; at: string; by: string };

export type EditorProps = {
  tenant: string;
  backHref: string;
  template: {
    id: string;
    name: string;
    version: number;
    visibleToPerson: boolean;
    isDefault: boolean;
  };
  definition: DocumentDefinition;
  versions: TemplateVersion[];
  brand: BrandColors;
  canEdit: boolean;
  save: (input: {
    tenant: string;
    templateId: string;
    name: string;
    visibleToPerson: boolean;
    definition: unknown;
    expectedVersion: number;
  }) => Promise<{ ok: true; data: { version: number } } | { ok: false; error: string }>;
  restore: (input: {
    tenant: string;
    templateId: string;
    auditId: string;
  }) => Promise<
    | { ok: true; data: { version: number; definition: DocumentDefinition } }
    | { ok: false; error: string }
  >;
};

const ADDABLE: {
  type: ElementType;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
}[] = [
  { type: "field", icon: Braces, hint: "Nome, empresa, categoria…" },
  { type: "text", icon: Type, hint: "Texto fixo, aceita campos" },
  { type: "qrcode", icon: QrCode, hint: "Link do crachá" },
  { type: "barcode", icon: Barcode, hint: "Leitor USB do balcão" },
  { type: "image", icon: ImageIcon, hint: "Logo ou foto" },
  { type: "box", icon: Square, hint: "Faixa ou moldura" },
  { type: "sections", icon: LayoutList, hint: "Voos, hotel e roteiro" },
];

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6];

export function DocumentEditor(props: EditorProps) {
  const { tenant, template, brand, canEdit } = props;
  const router = useRouter();
  const editor = useEditor(props.definition);
  const { def, selected, page } = editor;
  const [name, setName] = useState(template.name);
  const [visibleToPerson, setVisible] = useState(template.visibleToPerson);
  const [version, setVersion] = useState(template.version);
  const [savedJson, setSavedJson] = useState(() =>
    JSON.stringify({ d: props.definition, n: template.name, v: template.visibleToPerson }),
  );
  const [saving, startSave] = useTransition();
  const [zoom, setZoom] = useState<number | null>(null); // null = ajustar à tela
  const [fitZoom, setFitZoom] = useState(1);
  const [grid, setGrid] = useState(true);
  const [gridMm, setGridMm] = useState(1);
  const [snap, setSnap] = useState(true);
  const [guides, setGuides] = useState(true);
  const [pageCount, setPageCount] = useState(1);
  const [registration, setRegistration] = useState<{ id: string; name: string } | null>(null);
  const [panel, setPanel] = useState<"versions" | "data" | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const fields = useMemo(() => fieldsForKind(def.kind), [def.kind]);
  const fieldLabel = useCallback((k: string) => getField(k)?.label, []);
  const elementName = useCallback((el: DocumentElement) => baseName(el, fieldLabel), [fieldLabel]);
  const warnings: LayoutWarning[] = useMemo(
    () => validateLayout(def, (k) => !!getField(k) || k.startsWith("custom.")),
    [def],
  );
  const warned = useMemo(() => new Set(warnings.map((w) => w.elementId)), [warnings]);
  const dirty = JSON.stringify({ d: def, n: name, v: visibleToPerson }) !== savedJson;
  const K = KIND_UI[def.kind];
  const scaleFactor = zoom ?? fitZoom;
  const scale = scaleFactor * MM;
  const sel1 = selected.length === 1 ? def.elements.find((e) => e.id === selected[0]) : undefined;

  // ajustar à tela
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const pad = 96;
      const f = Math.min(
        (el.clientWidth - pad) / (def.page.width * MM),
        (el.clientHeight - pad) / (def.page.height * MM),
      );
      setFitZoom(Math.max(0.2, Math.min(8, f)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [def.page.width, def.page.height]);

  // avisa antes de sair com alterações
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = useCallback(() => {
    if (!canEdit || !dirty) return;
    startSave(async () => {
      const r = await props.save({
        tenant,
        templateId: template.id,
        name: name.trim() || template.name,
        visibleToPerson,
        definition: def,
        expectedVersion: version,
      });
      if (r.ok) {
        setVersion(r.data.version);
        setSavedJson(JSON.stringify({ d: def, n: name, v: visibleToPerson }));
        toast.success(`Modelo salvo · versão ${r.data.version}`);
        router.refresh();
      } else toast.error(r.error);
    });
  }, [canEdit, dirty, props, tenant, template, name, visibleToPerson, def, version, router]);

  // atalhos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.closest("input, textarea, select, [contenteditable=true]");
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
        return;
      }
      if (typing || !canEdit) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        editor.redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        editor.duplicate();
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        editor.select(def.elements.filter((x) => x.page === page && !x.hidden).map((x) => x.id));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selected.length) {
          e.preventDefault();
          editor.remove();
        }
      } else if (e.key === "Escape") {
        editor.select([]);
      } else if (e.key.startsWith("Arrow") && selected.length) {
        e.preventDefault();
        const d = e.shiftKey ? 5 : 0.5;
        editor.nudge(
          e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0,
          e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, save, canEdit, selected, def.elements, page]);

  function add(type: ElementType) {
    const pw = def.page.width;
    const ph = def.page.height;
    const base = { id: uid(), label: "", page, hidden: false, repeat: false, rotate: 0 as const };
    const style = {
      font: "sans" as const,
      weight: "regular" as const,
      size: Math.max(7, Math.min(18, pw / 8)),
      minSize: 5,
      autoFit: true,
      maxLines: 1,
      lineHeight: 1.15,
      align: "left" as const,
      valign: "middle" as const,
      color: "ink" as const,
      uppercase: false,
      letterSpacing: 0,
      radius: 0,
      padding: 0,
    };
    const tw = Math.round(Math.min(70, pw * 0.6));
    const th = Math.round(Math.max(5, Math.min(12, ph * 0.15)));
    const cx = (w: number) => Math.round((pw - w) / 2);
    const cy = (h: number) => Math.round((ph - h) / 2);
    let el: DocumentElement;
    switch (type) {
      case "text":
        el = { ...base, type, x: cx(tw), y: cy(th), w: tw, h: th, text: "Texto", style };
        break;
      case "field":
        el = {
          ...base,
          type,
          x: cx(tw),
          y: cy(th),
          w: tw,
          h: th,
          field: def.kind === "VOUCHER" ? "person.fullName" : "person.badgeName",
          fallback: "",
          prefix: "",
          suffix: "",
          style: { ...style, weight: "bold" },
        };
        break;
      case "qrcode": {
        const size = Math.round(Math.max(12, Math.min(28, Math.min(pw, ph) * 0.4)));
        el = {
          ...base,
          type,
          x: cx(size),
          y: cy(size),
          size,
          field: "registration.qrValue",
          errorCorrection: "M",
          color: "black",
          quietZone: 0,
        };
        break;
      }
      case "barcode":
        el = {
          ...base,
          type,
          x: cx(40),
          y: cy(10),
          w: Math.min(40, pw - 6),
          h: 10,
          field: "registration.shortCode",
          showText: true,
          color: "black",
        };
        break;
      case "image":
        el = {
          ...base,
          type,
          x: cx(30),
          y: cy(14),
          w: 30,
          h: 14,
          source: { kind: "field", field: "tenant.logo" },
          fit: "contain",
          align: "center",
          circle: false,
        };
        break;
      case "box":
        el = {
          ...base,
          type,
          x: 0,
          y: cy(8),
          w: pw,
          h: 8,
          fill: "brand",
          strokeWidth: 0.3,
          radius: 0,
          opacity: 1,
        };
        break;
      case "sections":
        el = {
          ...base,
          type,
          x: 12,
          y: Math.round(ph * 0.22),
          w: pw - 24,
          h: Math.round(ph * 0.66),
          sections: [
            { key: "passenger" },
            { key: "flights" },
            { key: "accommodation" },
            { key: "itinerary" },
          ],
          accent: "brand",
        };
        break;
    }
    editor.add(el);
  }

  const calibrationHref = `/api/documents/calibration?tenant=${encodeURIComponent(tenant)}&page=${encodeURIComponent(JSON.stringify(def.page))}`;
  const renderHref = (format: "pdf" | "thermal", extra = "") =>
    `/api/documents/${template.id}/render?format=${format}${registration ? `&registration=${registration.id}` : ""}${extra}`;
  const openRender = (format: "pdf" | "thermal", extra = "") => {
    if (dirty) {
      toast.warning("Salve antes de gerar", {
        description: "O PDF e a impressão usam a versão salva do modelo.",
        action: canEdit ? { label: "Salvar", onClick: save } : undefined,
      });
      return;
    }
    window.open(renderHref(format, extra), "_blank");
  };

  const zoomTo = (z: number) => setZoom(Math.max(0.2, Math.min(8, z)));
  const zoomStep = (dir: 1 | -1) => {
    const cur = scaleFactor;
    const next =
      dir > 0
        ? ZOOMS.find((z) => z > cur + 0.01)
        : [...ZOOMS].reverse().find((z) => z < cur - 0.01);
    zoomTo(next ?? cur);
  };

  return (
    <>
      {/* celular e tablet pequeno: biblioteca e pré-visualização somente leitura */}
      <MobileFallback
        tenant={tenant}
        backHref={props.backHref}
        name={name}
        def={def}
        renderHref={renderHref}
      />

      <div className="border-border bg-canvas hidden h-[calc(100dvh-220px)] min-h-[620px] flex-col overflow-hidden rounded-lg border lg:flex">
        {/* barra de ferramentas */}
        <div className="border-border bg-surface flex h-12 shrink-0 items-center gap-1 border-b px-2">
          <Button variant="ghost" size="icon-sm" asChild aria-label="Voltar à biblioteca">
            <Link href={props.backHref}>
              <ArrowLeft />
            </Link>
          </Button>
          <div className="border-border mx-1 h-6 border-l" />
          <K.icon className="text-fg-subtle size-4 shrink-0" aria-hidden />
          <input
            aria-label="Nome do modelo"
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            className="hover:border-border focus:border-brand h-8 w-[min(300px,20vw)] min-w-0 truncate rounded-sm border border-transparent bg-transparent px-2 text-base font-semibold outline-none"
          />
          <Badge size="sm">v{version}</Badge>
          {dirty && (
            <span
              aria-label="Alterações não salvas"
              title="Alterações não salvas"
              className="bg-warning size-2 shrink-0 rounded-full 2xl:hidden"
            />
          )}
          {template.isDefault && (
            <Badge size="sm" tone="brand">
              Padrão
            </Badge>
          )}
          <span
            className={cn(
              "hidden text-xs whitespace-nowrap 2xl:inline",
              dirty ? "text-warning" : "text-fg-faint",
            )}
          >
            {saving ? "Salvando…" : dirty ? "Alterações não salvas" : "Tudo salvo"}
          </span>

          <div className="ml-auto flex items-center gap-0.5">
            <ToolBtn
              label="Desfazer (Ctrl+Z)"
              disabled={!editor.canUndo || !canEdit}
              onClick={editor.undo}
            >
              <Undo2 />
            </ToolBtn>
            <ToolBtn
              label="Refazer (Ctrl+Shift+Z)"
              disabled={!editor.canRedo || !canEdit}
              onClick={editor.redo}
            >
              <Redo2 />
            </ToolBtn>
            <div className="border-border mx-1 h-6 border-l" />
            <ToolBtn label="Grade" active={grid} onClick={() => setGrid(!grid)}>
              <Grid3x3 />
            </ToolBtn>
            <ToolBtn
              label="Ímã (segure Alt para soltar livre)"
              active={snap}
              onClick={() => setSnap(!snap)}
            >
              <Magnet />
            </ToolBtn>
            <ToolBtn
              label="Guias de sangria, segurança e furos"
              active={guides}
              onClick={() => setGuides(!guides)}
            >
              <Ruler />
            </ToolBtn>
            <div className="border-border mx-1 h-6 border-l" />
            <ToolBtn label="Diminuir zoom" onClick={() => zoomStep(-1)}>
              <Minus />
            </ToolBtn>
            <button
              type="button"
              onClick={() => setZoom(zoom === null ? 1 : null)}
              title={zoom === null ? "Tamanho real (100%)" : "Ajustar à tela"}
              className="text-fg-muted hover:bg-hover h-8 w-14 rounded-sm font-mono text-xs tabular-nums"
            >
              {Math.round(scaleFactor * 100)}%
            </button>
            <ToolBtn label="Aumentar zoom" onClick={() => zoomStep(1)}>
              <Plus />
            </ToolBtn>
            <ToolBtn label="Ajustar à tela" active={zoom === null} onClick={() => setZoom(null)}>
              <Maximize />
            </ToolBtn>
            <div className="border-border mx-1 h-6 border-l" />
            <Button variant="ghost" size="sm" onClick={() => setPanel("data")}>
              <UserRound /> {registration ? registration.name.split(" ")[0] : "Dados de exemplo"}
            </Button>
            <ToolBtn label="Versões" onClick={() => setPanel("versions")}>
              <History />
            </ToolBtn>
            <Button variant="secondary" size="sm" onClick={() => openRender("pdf", "&guides=1")}>
              <FileDown /> PDF
            </Button>
            {def.output === "thermal" && (
              <Button variant="secondary" size="sm" onClick={() => openRender("thermal")}>
                <Printer /> Térmica
              </Button>
            )}
            {canEdit && (
              <Button size="sm" onClick={save} disabled={!dirty} loading={saving} className="ml-1">
                <Check /> Salvar
              </Button>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* esquerda: elementos e camadas */}
          <aside className="border-border bg-surface flex w-60 shrink-0 flex-col border-r">
            {canEdit && (
              <div className="border-border border-b p-3">
                <p className="text-fg-subtle mb-2 text-xs font-semibold">Adicionar</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {ADDABLE.filter((a) => a.type !== "sections" || def.kind === "VOUCHER").map(
                    (a) => (
                      <button
                        key={a.type}
                        type="button"
                        onClick={() => add(a.type)}
                        title={a.hint}
                        className="border-border hover:border-border-strong hover:bg-hover focus-visible:outline-brand-ring flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-xs font-medium transition-colors focus-visible:outline-2"
                      >
                        <a.icon className="text-fg-subtle size-4" />
                        {ELEMENT_LABEL[a.type]}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
                <p className="text-fg-subtle text-xs font-semibold">Camadas</p>
                <span className="text-fg-faint text-xs tabular-nums">{def.elements.length}</span>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2" aria-label="Camadas">
                {[...def.elements].reverse().map((el) => {
                  const isSel = selected.includes(el.id);
                  const otherPage = el.page !== page;
                  return (
                    <li key={el.id}>
                      <div
                        className={cn(
                          "group flex h-8 items-center gap-1.5 rounded-sm pr-1 pl-2 text-sm",
                          isSel ? "bg-brand-subtle text-brand-subtle-fg" : "hover:bg-hover",
                          (el.hidden || otherPage) && "opacity-55",
                        )}
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={(e) => {
                            if (otherPage) editor.setPage(el.page);
                            editor.select(e.shiftKey ? [...selected, el.id] : [el.id]);
                          }}
                        >
                          <LayerIcon type={el.type} />
                          <span className="truncate">{elementName(el)}</span>
                          {warned.has(el.id) && (
                            <TriangleAlert
                              className="text-warning size-3.5 shrink-0"
                              aria-label="Com aviso"
                            />
                          )}
                          {el.when && (
                            <span className="text-fg-faint shrink-0 text-[10px]">cond.</span>
                          )}
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            aria-label={el.hidden ? "Mostrar" : "Ocultar"}
                            onClick={() => editor.updateElement(el.id, { hidden: !el.hidden })}
                            className="text-fg-subtle hover:text-fg grid size-6 place-items-center rounded-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-3.5"
                          >
                            {el.hidden ? <EyeOff /> : <Eye />}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
                {def.elements.length === 0 && (
                  <li className="text-fg-subtle px-2 py-6 text-center text-sm">
                    Página vazia. Comece por um campo — o nome no crachá, por exemplo.
                  </li>
                )}
              </ul>
            </div>
          </aside>

          {/* centro: tela */}
          <div className="relative flex min-w-0 flex-1 flex-col">
            {selected.length > 0 && canEdit && (
              <div className="border-border bg-surface/95 shadow-pop absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-md border p-1 backdrop-blur">
                <span className="text-fg-subtle px-2 text-xs whitespace-nowrap">
                  {selected.length === 1 ? "Alinhar à página" : `${selected.length} elementos`}
                </span>
                <ToolBtn label="Alinhar à esquerda" onClick={() => editor.align("left")}>
                  <AlignStartVertical />
                </ToolBtn>
                <ToolBtn label="Centralizar na horizontal" onClick={() => editor.align("hcenter")}>
                  <AlignCenterVertical />
                </ToolBtn>
                <ToolBtn label="Alinhar à direita" onClick={() => editor.align("right")}>
                  <AlignEndVertical />
                </ToolBtn>
                <ToolBtn label="Alinhar ao topo" onClick={() => editor.align("top")}>
                  <AlignStartHorizontal />
                </ToolBtn>
                <ToolBtn label="Centralizar na vertical" onClick={() => editor.align("vcenter")}>
                  <AlignCenterHorizontal />
                </ToolBtn>
                <ToolBtn label="Alinhar à base" onClick={() => editor.align("bottom")}>
                  <AlignEndHorizontal />
                </ToolBtn>
                <div className="border-border mx-1 h-5 border-l" />
                <ToolBtn label="Duplicar (Ctrl+D)" onClick={() => editor.duplicate()}>
                  <Copy />
                </ToolBtn>
                <ToolBtn label="Excluir (Delete)" onClick={() => editor.remove()}>
                  <X />
                </ToolBtn>
              </div>
            )}
            <div
              ref={stage}
              className="min-h-0 flex-1 overflow-auto"
              style={{
                backgroundImage: "radial-gradient(var(--border-strong) 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }}
            >
              <div className="flex min-h-full min-w-full items-center justify-center p-12">
                <EditorCanvas
                  editor={editor}
                  tenant={tenant}
                  registrationId={registration?.id ?? null}
                  scale={scale}
                  grid={grid}
                  gridMm={gridMm}
                  snap={snap}
                  guides={guides}
                  warned={warned}
                  readOnly={!canEdit}
                  onPageCount={setPageCount}
                  elementName={elementName}
                />
              </div>
            </div>
            {/* rodapé: páginas, tamanho e avisos */}
            <div className="border-border bg-surface flex h-10 shrink-0 items-center gap-3 border-t px-3 text-xs">
              <span className="text-fg-subtle font-mono">
                {formatSize(def.page.width, def.page.height)}
              </span>
              {pageCount > 1 && (
                <span className="flex items-center gap-1">
                  <ToolBtn
                    label="Página anterior"
                    disabled={page === 0}
                    onClick={() => editor.setPage(page - 1)}
                  >
                    <ChevronLeft />
                  </ToolBtn>
                  <span className="tabular-nums">
                    Página {page + 1} de {pageCount}
                  </span>
                  <ToolBtn
                    label="Próxima página"
                    disabled={page >= pageCount - 1}
                    onClick={() => editor.setPage(page + 1)}
                  >
                    <ChevronRight />
                  </ToolBtn>
                </span>
              )}
              {grid && (
                <label className="text-fg-subtle flex items-center gap-1">
                  Grade
                  <select
                    className="bg-transparent font-mono"
                    value={gridMm}
                    onChange={(e) => setGridMm(Number(e.target.value))}
                  >
                    {[0.5, 1, 2, 5].map((g) => (
                      <option key={g} value={g}>
                        {String(g).replace(".", ",")} mm
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="ml-auto flex min-w-0 items-center gap-2">
                {warnings.length === 0 ? (
                  <span className="text-success flex items-center gap-1">
                    <Check className="size-3.5" /> Layout sem problemas
                  </span>
                ) : (
                  <WarningsMenu
                    warnings={warnings}
                    onPick={(id) => {
                      const el = def.elements.find((x) => x.id === id);
                      if (el) {
                        editor.setPage(el.page);
                        editor.select([id]);
                      }
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* direita: propriedades */}
          <aside
            className="border-border bg-surface w-[300px] shrink-0 overflow-y-auto border-l"
            aria-label="Propriedades"
          >
            <fieldset disabled={!canEdit} className="min-w-0">
              {sel1 ? (
                <ElementInspector
                  key={sel1.id}
                  editor={editor}
                  el={sel1}
                  fields={fields}
                  brand={brand}
                  tenant={tenant}
                  pageCount={pageCount}
                />
              ) : selected.length > 1 ? (
                <div className="text-fg-muted p-4 text-sm">
                  <p className="font-medium">{selected.length} elementos selecionados</p>
                  <p className="text-fg-subtle mt-1 text-xs">
                    Use a barra acima da tela para alinhar, duplicar ou excluir. Setas movem 0,5 mm
                    (Shift: 5 mm).
                  </p>
                </div>
              ) : (
                <>
                  <PageInspector
                    editor={editor}
                    brand={brand}
                    tenant={tenant}
                    calibrationHref={calibrationHref}
                  />
                  <div className="border-border border-t px-4 py-4">
                    <Toggle
                      checked={visibleToPerson}
                      onChange={setVisible}
                      label="Disponível para a pessoa"
                      hint="Aparece no portal do viajante / área do participante."
                    />
                  </div>
                  <Shortcuts />
                </>
              )}
            </fieldset>
          </aside>
        </div>
      </div>

      <Sheet
        open={panel === "data"}
        onOpenChange={(o) => setPanel(o ? "data" : null)}
        title="Dados da pré-visualização"
        description="Veja o documento com os dados de exemplo ou de uma inscrição real."
      >
        <PreviewData
          tenant={tenant}
          current={registration}
          onPick={(r) => {
            setRegistration(r);
            setPanel(null);
          }}
        />
      </Sheet>
      <Sheet
        open={panel === "versions"}
        onOpenChange={(o) => setPanel(o ? "versions" : null)}
        title="Versões"
        description="Cada vez que você salva, a versão anterior fica guardada aqui."
      >
        <Versions
          versions={props.versions}
          current={version}
          canEdit={canEdit}
          onRestore={async (v) => {
            const r = await props.restore({ tenant, templateId: template.id, auditId: v.id });
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            editor.reset(r.data.definition);
            setVersion(r.data.version);
            setSavedJson(JSON.stringify({ d: r.data.definition, n: name, v: visibleToPerson }));
            setPanel(null);
            toast.success(`Versão ${v.version} restaurada como versão ${r.data.version}.`);
            router.refresh();
          }}
        />
      </Sheet>
    </>
  );
}

function ToolBtn({
  label,
  onClick,
  children,
  active,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "focus-visible:outline-brand-ring grid size-8 shrink-0 place-items-center rounded-sm transition-colors focus-visible:outline-2 disabled:opacity-35 [&_svg]:size-4",
        active
          ? "bg-brand-subtle text-brand-subtle-fg"
          : "text-fg-muted hover:bg-hover hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function LayerIcon({ type }: { type: ElementType }) {
  const I = {
    text: Type,
    field: Braces,
    qrcode: QrCode,
    barcode: Barcode,
    image: ImageIcon,
    box: Square,
    sections: LayoutList,
  }[type];
  return <I className="text-fg-subtle size-3.5 shrink-0" aria-hidden />;
}

function WarningsMenu({
  warnings,
  onPick,
}: {
  warnings: LayoutWarning[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-warning hover:bg-warning-bg flex h-7 items-center gap-1.5 rounded-sm px-2 font-medium"
        aria-expanded={open}
      >
        <TriangleAlert className="size-3.5" />
        {warnings.length} {warnings.length === 1 ? "aviso" : "avisos"}
      </button>
      {open && (
        <ul className="border-border bg-surface-raised shadow-pop absolute right-0 bottom-9 z-30 w-80 rounded-md border p-1">
          {warnings.map((w, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onPick(w.elementId);
                  setOpen(false);
                }}
                className="hover:bg-hover w-full rounded-sm px-2.5 py-2 text-left text-sm"
              >
                {w.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Shortcuts() {
  const rows = [
    ["Salvar", "Ctrl S"],
    ["Desfazer / refazer", "Ctrl Z · Ctrl ⇧ Z"],
    ["Duplicar", "Ctrl D"],
    ["Mover", "Setas · ⇧ 5 mm"],
    ["Soltar sem ímã", "segure Alt"],
    ["Selecionar vários", "⇧ clique"],
  ];
  return (
    <div className="border-border border-t px-4 py-4">
      <p className="text-fg-subtle mb-2 text-xs font-semibold">Atalhos</p>
      <dl className="flex flex-col gap-1.5 text-xs">
        {rows.map(([a, b]) => (
          <div key={a} className="flex justify-between gap-2">
            <dt className="text-fg-muted">{a}</dt>
            <dd className="text-fg-subtle font-mono">{b}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PreviewData({
  tenant,
  current,
  onPick,
}: {
  tenant: string;
  current: { id: string; name: string } | null;
  onPick: (r: { id: string; name: string } | null) => void;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<
    { id: string; name: string; project: string; shortCode: string }[] | null
  >(null);
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/documents/registrations?tenant=${encodeURIComponent(tenant)}&q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal },
        );
        if (res.ok) setRows(await res.json());
      } catch {
        /* cancelado */
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, tenant]);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => onPick(null)}
        className={cn(
          "flex items-center gap-3 rounded-md border p-3 text-left",
          !current ? "border-brand bg-brand-subtle" : "border-border hover:bg-hover",
        )}
      >
        <Monitor className="text-fg-subtle size-4" />
        <span>
          <span className="block text-sm font-medium">Dados de exemplo</span>
          <span className="text-fg-subtle text-xs">
            Nome longo, empresa e categoria fictícios — bom para testar o ajuste.
          </span>
        </span>
      </button>
      <input
        className="border-border-strong focus:border-brand h-9 rounded-sm border bg-transparent px-3 text-base outline-none"
        placeholder="Buscar inscrição por nome ou código"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {rows === null ? (
        <p className="text-fg-subtle text-sm">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-fg-subtle text-sm">
          {q
            ? "Nenhuma inscrição encontrada."
            : "Este cliente ainda não tem inscrições. Use os dados de exemplo."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick({ id: r.id, name: r.name })}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left",
                  current?.id === r.id ? "bg-brand-subtle" : "hover:bg-hover",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="text-fg-subtle block truncate text-xs">{r.project}</span>
                </span>
                <span className="text-fg-subtle font-mono text-xs">{r.shortCode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Versions({
  versions,
  current,
  canEdit,
  onRestore,
}: {
  versions: TemplateVersion[];
  current: number;
  canEdit: boolean;
  onRestore: (v: TemplateVersion) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return (
    <ol className="flex flex-col">
      <li className="border-border flex items-center justify-between border-b py-3">
        <span>
          <span className="block text-sm font-medium">Versão {current}</span>
          <span className="text-fg-subtle text-xs">Atual</span>
        </span>
        <Badge size="sm" tone="success">
          Em uso
        </Badge>
      </li>
      {versions.length === 0 && (
        <li className="text-fg-subtle py-6 text-sm">Ainda não há versões anteriores.</li>
      )}
      {versions.map((v) => (
        <li
          key={v.id}
          className="border-border flex items-center justify-between gap-3 border-b py-3"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">Versão {v.version}</span>
            <span className="text-fg-subtle block truncate text-xs">
              {fmt.format(new Date(v.at))} · {v.by}
            </span>
          </span>
          {canEdit && (
            <Button
              size="sm"
              variant="secondary"
              loading={busy === v.id}
              onClick={async () => {
                setBusy(v.id);
                await onRestore(v);
                setBusy(null);
              }}
            >
              <RotateCcw /> Restaurar
            </Button>
          )}
        </li>
      ))}
    </ol>
  );
}

function MobileFallback({
  tenant,
  backHref,
  name,
  def,
  renderHref,
}: {
  tenant: string;
  backHref: string;
  name: string;
  def: DocumentDefinition;
  renderHref: (f: "pdf" | "thermal", extra?: string) => string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min((width - 32) / def.page.width, 420 / def.page.height);
  return (
    <div className="flex flex-col gap-5 lg:hidden">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" asChild aria-label="Voltar à biblioteca">
          <Link href={backHref}>
            <ArrowLeft />
          </Link>
        </Button>
        <h2 className="min-w-0 truncate text-lg font-semibold">{name}</h2>
      </div>
      <div ref={box} className="bg-surface-muted grid place-items-center rounded-lg p-4">
        <div className="shadow-sm ring-1 ring-black/5">
          <PagePreview tenant={tenant} definition={def} scale={scale} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" asChild>
          <a href={renderHref("pdf")} target="_blank" rel="noreferrer">
            <FileDown /> Ver PDF
          </a>
        </Button>
        <Button variant="secondary" asChild>
          <a href={renderHref("thermal")} target="_blank" rel="noreferrer">
            <Printer /> Impressão
          </a>
        </Button>
      </div>
      <div className="border-border bg-surface flex gap-3 rounded-lg border p-4">
        <Monitor className="text-fg-subtle mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-sm font-medium">Edite em uma tela maior</p>
          <p className="text-fg-subtle mt-0.5 text-sm">
            O editor visual trabalha em milímetros, com régua e alças de precisão. Abra este modelo
            no computador para ajustar o layout.
          </p>
        </div>
      </div>
    </div>
  );
}
