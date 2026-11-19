import { describe, expect, it } from "vitest";
import { encodeCsv, encodeWindows1252, toCsv } from "./index";

describe("toCsv", () => {
  it("usa ponto e vírgula, CRLF e aspas quando precisa", () => {
    const csv = toCsv(
      ["Nome", "Empresa"],
      [
        ["Ana; Maria", 'Diz "oi"'],
        ["João", null],
      ],
    );
    expect(csv).toBe('Nome;Empresa\r\n"Ana; Maria";"Diz ""oi"""\r\nJoão;\r\n');
  });

  it("neutraliza fórmulas do Excel em textos", () => {
    expect(toCsv(["x"], [["=1+1"], ["@SOMA"], [-5]])).toBe("x\r\n'=1+1\r\n'@SOMA\r\n-5\r\n");
  });
});

describe("codificação", () => {
  it("UTF-8 sai com BOM", () => {
    const bytes = encodeCsv("é");
    expect([...bytes]).toEqual([0xef, 0xbb, 0xbf, 0xc3, 0xa9]);
  });

  it("Windows-1252 mantém acentos, euro e travessão; o resto vira ?", () => {
    expect([...encodeWindows1252("Ação €—")]).toEqual([0x41, 0xe7, 0xe3, 0x6f, 0x20, 0x80, 0x97]);
    expect([...encodeWindows1252("日")]).toEqual([0x3f]);
    expect(new TextDecoder("windows-1252").decode(encodeCsv("Café", "windows-1252"))).toBe("Café");
  });
});
