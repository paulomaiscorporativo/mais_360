import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  isHex,
  normalizeHex,
  oklchToRgb,
  parseHex,
  rgbToOklch,
  toHex,
} from "./color";
import {
  AA_TEXT,
  AA_UI,
  RAMP_STEPS,
  SURFACE_DARK,
  SURFACE_LIGHT,
  buildBrandTheme,
  buildRamp,
  onColor,
  themeCss,
} from "./theme";

// Marcas reais dos primeiros clientes + casos difíceis (amarelo, quase branco, quase preto, cinza)
const BRANDS = [
  "#6ba63d", // ABIEC
  "#123f6d", // ABIEC secundária
  "#1690d0", // ABRADILAN
  "#002042", // Mais Corporativo
  "#a0bf27", // verde-limão
  "#ffd400", // amarelo puro
  "#f5f5f5", // quase branco
  "#050505", // quase preto
  "#808080", // cinza médio
  "#e11d48", // vermelho
];

describe("conversões de cor", () => {
  it("ida e volta sRGB → OKLCH → sRGB preserva a cor", () => {
    for (const hex of BRANDS) expect(toHex(oklchToRgb(rgbToOklch(parseHex(hex))))).toBe(hex);
  });

  it("aceita formato curto e rejeita lixo", () => {
    expect(normalizeHex("#0af")).toBe("#00aaff");
    expect(isHex("azul")).toBe(false);
    expect(() => parseHex("azul")).toThrow(/Cor inválida/);
  });

  it("contraste WCAG conhecido", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
});

describe("rampa", () => {
  it("vai do mais claro ao mais escuro, monotonicamente", () => {
    for (const hex of BRANDS) {
      const ramp = buildRamp(hex);
      const lum = RAMP_STEPS.map((s) => rgbToOklch(parseHex(ramp[s])).l);
      for (let i = 1; i < lum.length; i++) expect(lum[i]!).toBeLessThan(lum[i - 1]!);
    }
  });
});

describe("tema da marca garante AA para qualquer cor", () => {
  for (const hex of BRANDS) {
    it(hex, () => {
      const t = buildBrandTheme(hex);
      for (const roles of [t.light, t.dark]) {
        expect(contrastRatio(roles.brand, roles.brandFg)).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(roles.brandHover, onColor(roles.brandHover))).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
        expect(contrastRatio(roles.brandSubtle, roles.brandSubtleFg)).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
      }
      expect(contrastRatio(t.light.brandText, SURFACE_LIGHT)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(t.dark.brandText, SURFACE_DARK)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(t.light.brandRing, SURFACE_LIGHT)).toBeGreaterThanOrEqual(AA_UI);
      expect(contrastRatio(t.dark.brandRing, SURFACE_DARK)).toBeGreaterThanOrEqual(AA_UI);
    });
  }

  it("no modo claro o botão usa exatamente a cor do cliente", () => {
    expect(buildBrandTheme("#6BA63D").light.brand).toBe("#6ba63d");
  });

  it("marca muito escura ganha um tom visível no modo escuro", () => {
    const t = buildBrandTheme("#002042");
    expect(t.dark.brand).not.toBe("#002042");
    expect(contrastRatio(t.dark.brand, SURFACE_DARK)).toBeGreaterThanOrEqual(AA_UI);
  });
});

describe("themeCss", () => {
  it("gera variáveis claras e escuras", () => {
    const css = themeCss(buildBrandTheme("#1690d0"));
    expect(css).toContain(":root{--brand:#1690d0;");
    expect(css).toContain("--brand-500:");
    expect(css).toContain(".dark{--brand:");
  });
});
