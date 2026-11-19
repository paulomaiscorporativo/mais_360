/**
 * Codificador CODE128 (subconjuntos B e C) puro: devolve a sequência de
 * larguras de barras/espaços em módulos, para desenhar em PDF ou SVG.
 * Usa o subconjunto C (dois dígitos por símbolo) quando o conteúdo é só
 * numérico e par — códigos curtos de crachá ficam bem mais compactos.
 */

// Padrões oficiais: cada símbolo = 6 elementos (barra, espaço, …); STOP = 7.
const PATTERNS = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
] as const;

const START_B = 104;
const START_C = 105;
const STOP = 106;

export type Code128 = {
  /** Larguras alternadas barra/espaço, começando por barra, em módulos. */
  widths: number[];
  /** Total de módulos (sem zona de silêncio). */
  modules: number;
};

export function encodeCode128(value: string): Code128 {
  const text = value.length ? value : "0";
  const numeric = /^\d+$/.test(text) && text.length % 2 === 0 && text.length >= 4;
  const codes: number[] = [];
  if (numeric) {
    codes.push(START_C);
    for (let i = 0; i < text.length; i += 2) codes.push(Number(text.slice(i, i + 2)));
  } else {
    codes.push(START_B);
    for (const ch of text) {
      const c = ch.charCodeAt(0);
      // Subconjunto B cobre ASCII 32–127; o resto vira "?" (crachás usam códigos ASCII)
      codes.push(c >= 32 && c <= 127 ? c - 32 : "?".charCodeAt(0) - 32);
    }
  }
  const checksum = codes.reduce((sum, code, i) => sum + code * (i === 0 ? 1 : i), 0) % 103;
  codes.push(checksum, STOP);

  const widths: number[] = [];
  for (const code of codes) for (const w of PATTERNS[code] ?? "") widths.push(Number(w));
  return { widths, modules: widths.reduce((a, b) => a + b, 0) };
}
