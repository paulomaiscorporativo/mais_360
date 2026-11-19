import {
  PT_TO_MM,
  formatCpf,
  formatDate,
  formatTime,
  interpolate,
  resolveField,
  textStyleSchema,
  wrapText,
  type DocFlight,
  type DocStay,
  type DocumentData,
  type SectionsElement,
  type TextStyle,
  type VoucherSection,
} from "@mais/core";
import { fontMeasurer } from "./fonts";
import { layoutText, type DisplayItem } from "./prepare";

/**
 * Seções automáticas do voucher (porte do modo automático da ABIEC), agora em
 * mm, com UTF-8 completo e visual de cartão de embarque. O resultado são itens
 * de exibição por página: o primeiro array vai na região original; os demais
 * são páginas de continuação.
 */

const INK = "#0b1a2b";
const MUTED = "#55657a";
const SUBTLE = "#8a97a8";
const LINE = "#dde3ea";
const CARD = "#f5f7fa";

type Style = Partial<TextStyle>;
const st = (s: Style): TextStyle => textStyleSchema.parse({ autoFit: true, valign: "top", ...s });

class Flow {
  pages: DisplayItem[][] = [[]];
  y: number;
  constructor(
    private readonly el: SectionsElement,
    readonly accent: string,
  ) {
    this.y = el.y;
  }
  get x() {
    return this.el.x;
  }
  get w() {
    return this.el.w;
  }
  private get bottom() {
    const first = this.pages.length === 1;
    const top = first ? this.el.y : (this.el.continuationY ?? this.el.y);
    const h = first ? this.el.h : (this.el.continuationH ?? this.el.h);
    return top + h;
  }
  /** Garante espaço; se não houver, abre página de continuação. */
  ensure(h: number) {
    if (this.y + h <= this.bottom + 0.01) return;
    this.pages.push([]);
    this.y = this.el.continuationY ?? this.el.y;
  }
  push(item: DisplayItem) {
    this.pages[this.pages.length - 1]?.push(item);
  }
  text(value: string, x: number, y: number, w: number, h: number, s: Style, color = INK) {
    if (!value) return;
    this.push(layoutText(value, { x, y, w, h }, st(s), { color }));
  }
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    o: { fill?: string; stroke?: string; radius?: number; strokeWidth?: number } = {},
  ) {
    this.push({
      kind: "rect",
      x,
      y,
      w,
      h,
      fill: o.fill,
      stroke: o.stroke,
      strokeWidth: o.strokeWidth ?? 0.25,
      radius: o.radius ?? 0,
      opacity: 1,
    });
  }
}

function title(flow: Flow, label: string, firstBlockH: number) {
  flow.ensure(9 + firstBlockH);
  flow.rect(flow.x, flow.y + 0.4, 1, 4.2, { fill: flow.accent, radius: 0.3 });
  flow.text(label, flow.x + 3.2, flow.y, flow.w - 3.2, 5, {
    size: 9,
    weight: "semibold",
    uppercase: true,
    letterSpacing: 1.1,
  });
  flow.y += 8;
}

type Cell = { label: string; value: string; span?: number; mono?: boolean };

function grid(flow: Flow, cells: Cell[], cols = 3) {
  const gap = 4;
  const colW = (flow.w - gap * (cols - 1)) / cols;
  const rowH = 11;
  let col = 0;
  const visible = cells.filter((c) => c.value);
  for (let i = 0; i < visible.length; i++) {
    const c = visible[i];
    if (!c) continue;
    const span = Math.min(cols, c.span ?? 1);
    if (col + span > cols) {
      col = 0;
      flow.y += rowH;
    }
    if (col === 0) flow.ensure(rowH);
    const x = flow.x + col * (colW + gap);
    const w = colW * span + gap * (span - 1);
    flow.text(
      c.label,
      x,
      flow.y,
      w,
      3.4,
      { size: 6.2, weight: "semibold", uppercase: true, letterSpacing: 0.7 },
      MUTED,
    );
    flow.text(c.value, x, flow.y + 3.7, w, 5.6, {
      size: 10,
      minSize: 7,
      font: c.mono ? "mono" : "sans",
    });
    col += span;
    if (col >= cols) {
      col = 0;
      flow.y += rowH;
    }
  }
  if (col !== 0) flow.y += rowH;
  flow.y += 2;
}

function duration(f: DocFlight): string {
  if (!f.departure || !f.arrival) return "";
  const min = Math.round((new Date(f.arrival).getTime() - new Date(f.departure).getTime()) / 60000);
  if (!(min > 0)) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m}min`;
}

function flightCard(flow: Flow, f: DocFlight, tz: string) {
  const h = f.operatedBy ? 29 : 24.5;
  flow.ensure(h + 3);
  const { x, w } = flow;
  const y = flow.y;
  flow.rect(x, y, w, h, { fill: CARD, stroke: LINE, radius: 2.2 });

  // Coluna da companhia
  const cx = x + 5;
  if (f.airlineLogoFileId) {
    flow.push({
      kind: "image",
      x: cx,
      y: y + 4,
      w: 22,
      h: 7,
      fileId: f.airlineLogoFileId,
      fit: "contain",
      align: "left",
      circle: false,
    });
  } else {
    flow.text(f.airlineName || f.airlineCode || "", cx, y + 4.5, 30, 5, {
      size: 9.5,
      weight: "bold",
    });
  }
  flow.text(
    f.flightNumber,
    cx,
    y + 12.5,
    30,
    4.5,
    { font: "mono", size: 8.5, letterSpacing: 0.4 },
    INK,
  );
  if (f.cabin)
    flow.text(f.cabin, cx, y + 17, 30, 4, { size: 7, uppercase: true, letterSpacing: 0.5 }, MUTED);

  // Rota
  const rx = x + 42;
  const routeW = 78;
  const side = 24;
  flow.text(f.originIata, rx, y + 3.5, side, 9, { size: 21, weight: "bold", letterSpacing: -0.2 });
  flow.text(formatTime(f.departure, tz), rx, y + 12.8, side, 4.5, { size: 9, weight: "semibold" });
  flow.text(f.originName ?? "", rx, y + 17.2, side + 6, 4, { size: 6.8, minSize: 5 }, MUTED);
  const dx = rx + routeW - side;
  flow.text(f.destIata, dx, y + 3.5, side, 9, {
    size: 21,
    weight: "bold",
    align: "right",
    letterSpacing: -0.2,
  });
  flow.text(formatTime(f.arrival, tz), dx, y + 12.8, side, 4.5, {
    size: 9,
    weight: "semibold",
    align: "right",
  });
  flow.text(
    f.destName ?? "",
    dx - 6,
    y + 17.2,
    side + 6,
    4,
    { size: 6.8, minSize: 5, align: "right" },
    MUTED,
  );
  // Linha da rota com marcadores
  const lx = rx + side + 2;
  const lw = routeW - 2 * side - 4;
  flow.rect(lx, y + 8.2, lw, 0.35, { fill: SUBTLE });
  flow.rect(lx - 0.6, y + 7.7, 1.3, 1.3, { fill: flow.accent, radius: 0.65 });
  flow.rect(lx + lw - 0.7, y + 7.7, 1.3, 1.3, { fill: flow.accent, radius: 0.65 });
  const dur = duration(f);
  if (dur) flow.text(dur, lx, y + 3.4, lw, 3.8, { size: 6.8, align: "center" }, MUTED);
  flow.text(
    formatDate(f.departure, tz),
    lx,
    y + 10.2,
    lw,
    3.8,
    { size: 6.8, align: "center" },
    MUTED,
  );

  // Assento e localizador
  const sx = x + w - 52;
  flow.rect(sx - 4, y + 4, 0.25, 15.5, { fill: LINE });
  flow.text(
    "Assento",
    sx,
    y + 4.2,
    20,
    3.4,
    { size: 6.2, weight: "semibold", uppercase: true, letterSpacing: 0.7 },
    MUTED,
  );
  flow.text(f.seat || "—", sx, y + 7.8, 20, 6, { size: 13, weight: "bold" });
  flow.text(
    "Localizador",
    sx + 22,
    y + 4.2,
    26,
    3.4,
    { size: 6.2, weight: "semibold", uppercase: true, letterSpacing: 0.7 },
    MUTED,
  );
  flow.text(f.locator || "—", sx + 22, y + 7.8, 26, 6, {
    font: "mono",
    size: 11.5,
    weight: "semibold",
    letterSpacing: 0.6,
  });

  if (f.operatedBy) {
    flow.rect(x + 5, y + 22.6, w - 10, 0.25, { fill: LINE });
    flow.text(
      `Voo comercializado pela ${f.airlineName || f.airlineCode} e operado pela ${f.operatedBy}. Faça o check-in no balcão da operadora.`,
      x + 5,
      y + 23.8,
      w - 10,
      4,
      { size: 7, weight: "semibold", minSize: 5.5 },
      "#9a3412",
    );
  }
  flow.y += h + 3;
}

function stayCard(flow: Flow, s: DocStay, tz: string) {
  const h = 26;
  flow.ensure(h + 3);
  const { x, w } = flow;
  const y = flow.y;
  flow.rect(x, y, w, h, { fill: CARD, stroke: LINE, radius: 2.2 });
  flow.text(s.name, x + 5, y + 4, w - 10, 6, { size: 12, weight: "bold" });
  flow.text(
    [s.address, s.city, s.country].filter(Boolean).join(", "),
    x + 5,
    y + 10,
    w - 10,
    4.2,
    { size: 8 },
    MUTED,
  );
  const cols: Cell[] = [
    { label: "Check-in", value: formatDate(s.checkIn, tz) },
    { label: "Check-out", value: formatDate(s.checkOut, tz) },
    { label: "Quarto", value: [s.room, s.roomType].filter(Boolean).join(" · ") },
    { label: "Confirmação", value: s.confirmation ?? "", mono: true },
  ].filter((c) => c.value);
  const colW = (w - 10) / Math.max(1, cols.length);
  cols.forEach((c, i) => {
    const cx = x + 5 + i * colW;
    flow.text(
      c.label,
      cx,
      y + 16,
      colW - 3,
      3.4,
      { size: 6.2, weight: "semibold", uppercase: true, letterSpacing: 0.7 },
      MUTED,
    );
    flow.text(c.value, cx, y + 19.6, colW - 3, 5, {
      size: 9.5,
      weight: "semibold",
      font: c.mono ? "mono" : "sans",
      minSize: 6.5,
    });
  });
  flow.y += h + 3;
}

function itinerary(flow: Flow, data: DocumentData, tz: string) {
  const rowH = 7.5;
  for (const item of data.itinerary ?? []) {
    flow.ensure(rowH);
    const { x, w, y } = flow;
    flow.text(formatDate(item.date, tz), x, y + 1.6, 22, 4.5, { size: 8.5, weight: "semibold" });
    flow.text(
      [item.startTime, item.endTime].filter(Boolean).join("–"),
      x + 23,
      y + 1.6,
      16,
      4.5,
      { size: 8.5, font: "mono" },
      MUTED,
    );
    flow.text(item.title, x + 41, y + 1.6, w - 41 - 46, 4.5, { size: 9, minSize: 6.5 });
    flow.text(
      item.location ?? "",
      x + w - 44,
      y + 1.6,
      44,
      4.5,
      { size: 8, align: "right", minSize: 6 },
      MUTED,
    );
    flow.rect(x, y + rowH - 0.25, w, 0.2, { fill: LINE });
    flow.y += rowH;
  }
  flow.y += 4;
}

function paragraph(flow: Flow, text: string) {
  const size = 9;
  const lineH = size * 1.45 * PT_TO_MM;
  const lines = wrapText(text, flow.w, size, { font: "sans", weight: "regular" }, fontMeasurer);
  for (const line of lines) {
    flow.ensure(lineH);
    flow.text(
      line,
      flow.x,
      flow.y,
      flow.w,
      lineH,
      { size, autoFit: false, lineHeight: 1.45 },
      "#2b3a4d",
    );
    flow.y += lineH;
  }
  flow.y += 4;
}

function hasContent(
  key: VoucherSection["key"],
  data: DocumentData,
  section: VoucherSection,
): boolean {
  switch (key) {
    case "flights":
      return (data.flights?.length ?? 0) > 0;
    case "accommodation":
      return (data.stays?.length ?? 0) > 0;
    case "itinerary":
      return (data.itinerary?.length ?? 0) > 0;
    case "emergency":
      return !!(data.person?.emergencyName || data.person?.emergencyPhone);
    case "freeText":
      return !!section.content?.trim();
    case "passenger":
      return true;
  }
}

const DEFAULT_TITLES: Record<VoucherSection["key"], string> = {
  passenger: "Viajante",
  flights: "Voos",
  accommodation: "Hospedagem",
  itinerary: "Roteiro",
  emergency: "Contato de emergência",
  freeText: "Informações",
};

export function layoutSections(
  el: SectionsElement,
  data: DocumentData,
  accent: string,
): DisplayItem[][] {
  const tz = data.timezone || "America/Sao_Paulo";
  const flow = new Flow(el, accent);
  for (const section of el.sections) {
    if (!hasContent(section.key, data, section)) continue;
    const label = section.title || DEFAULT_TITLES[section.key];
    switch (section.key) {
      case "passenger":
        title(flow, label, 11);
        grid(flow, [
          { label: "Nome", value: resolveField(data, "person.fullName"), span: 2 },
          { label: "CPF", value: formatCpf(data.person?.cpf), mono: true },
          { label: "Passaporte", value: data.person?.passportNumber ?? "", mono: true },
          { label: "Validade do passaporte", value: formatDate(data.person?.passportExpiry, tz) },
          { label: "Nascimento", value: formatDate(data.person?.birthDate, tz) },
          { label: "Empresa", value: resolveField(data, "organization.name"), span: 2 },
          { label: "Grupo", value: data.registration?.group ?? "" },
          { label: "Restrições alimentares", value: data.person?.dietary ?? "", span: 3 },
        ]);
        break;
      case "flights": {
        title(flow, label, 27);
        const t = (f: DocFlight) => (f.departure ? new Date(f.departure).getTime() : 0);
        for (const f of [...(data.flights ?? [])].sort((a, b) => t(a) - t(b)))
          flightCard(flow, f, tz);
        flow.y += 2;
        break;
      }
      case "accommodation":
        title(flow, label, 29);
        for (const s of data.stays ?? []) stayCard(flow, s, tz);
        flow.y += 2;
        break;
      case "itinerary":
        title(flow, label, 7.5);
        itinerary(flow, data, tz);
        break;
      case "emergency":
        title(flow, label, 11);
        grid(flow, [
          { label: "Nome", value: data.person?.emergencyName ?? "", span: 2 },
          {
            label: "Telefone",
            value: resolveField({ person: { phone: data.person?.emergencyPhone } }, "person.phone"),
          },
        ]);
        break;
      case "freeText":
        title(flow, label, 6);
        paragraph(flow, interpolate(section.content ?? "", data));
        break;
    }
  }
  return flow.pages;
}
