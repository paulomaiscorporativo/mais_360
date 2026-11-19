import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptOptional, decryptSecret, encryptOptional, encryptSecret, parseKey } from "./index";

const key = randomBytes(32);

describe("cifra de segredos", () => {
  it("ida e volta, com acentos", () => {
    const s = "senha-çãé-123";
    const enc = encryptSecret(s, key);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain(s);
    expect(decryptSecret(enc, key)).toBe(s);
  });

  it("mesmo texto gera cifras diferentes (IV aleatório)", () => {
    expect(encryptSecret("x", key)).not.toBe(encryptSecret("x", key));
  });

  it("chave errada ou conteúdo adulterado falha", () => {
    const enc = encryptSecret("segredo", key);
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
    const parts = enc.split(":");
    parts[3] = Buffer.from("outro").toString("base64url");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
  });

  it("valida o tamanho da chave", () => {
    expect(() => parseKey("curta")).toThrow(/ENCRYPTION_KEY/);
    expect(parseKey(key.toString("base64")).length).toBe(32);
  });

  it("vazio continua vazio", () => {
    expect(encryptOptional("", key)).toBe("");
    expect(decryptOptional("", key)).toBe("");
  });
});
