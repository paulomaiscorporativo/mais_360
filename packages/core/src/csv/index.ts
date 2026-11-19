/**
 * CSV para exportação (sem I/O).
 *
 * Padrão da plataforma: UTF-8 com BOM e ponto e vírgula — o Excel em português
 * abre com os acentos certos. Para Excel antigo e sistemas legados há a volta
 * para Windows-1252 (o mesmo par usado na importação).
 */

export type CsvCell = string | number | boolean | Date | null | undefined;
export type CsvEncoding = "utf-8" | "windows-1252";

/** Neutraliza fórmulas (=, +, -, @) que o Excel executaria ao abrir o arquivo. */
function guardFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function cell(v: CsvCell, sep: string): string {
  if (v === null || v === undefined) return "";
  const s =
    v instanceof Date ? v.toISOString() : typeof v === "string" ? guardFormula(v) : String(v);
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(
  header: readonly string[],
  rows: readonly (readonly CsvCell[])[],
  separator = ";",
): string {
  return (
    [header, ...rows].map((r) => r.map((v) => cell(v, separator)).join(separator)).join("\r\n") +
    "\r\n"
  );
}

// Windows-1252 difere do Latin-1 só na faixa 0x80–0x9F
const CP1252_EXTRA: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/** Codifica em Windows-1252; o que não existe na tabela vira "?". */
export function encodeWindows1252(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0x3f;
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) out.push(code);
    else out.push(CP1252_EXTRA[code] ?? 0x3f);
  }
  return Uint8Array.from(out);
}

/** Bytes do arquivo: UTF-8 com BOM (padrão) ou Windows-1252. */
export function encodeCsv(text: string, encoding: CsvEncoding = "utf-8"): Uint8Array {
  if (encoding === "windows-1252") return encodeWindows1252(text);
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(body, 3);
  return out;
}
