import { describe, expect, it } from "vitest";
import {
  chunkBatches,
  documentRequirements,
  muralState,
  readTravelSettings,
  requiredDocumentKinds,
  requirementSummary,
  ticketAwaitsStaff,
  ticketStatusAfterMessage,
  visibleMural,
  voucherFileName,
  voucherJobKey,
  type MuralPostLike,
} from "./index";

const now = new Date("2026-12-01T12:00:00Z");
const day = 86_400_000;

function post(p: Partial<MuralPostLike> & { id: string }): MuralPostLike {
  return {
    audience: "ALL",
    audienceId: null,
    urgent: false,
    pinned: false,
    active: true,
    publishAt: new Date(now.getTime() - day),
    expiresAt: null,
    ...p,
  };
}

const viewer = { registrationId: "r1", groupId: "g1", categoryId: null, isStaff: false };

describe("mural", () => {
  it("classifica agendado, no ar, expirado e oculto", () => {
    expect(muralState(post({ id: "a" }), now)).toBe("LIVE");
    expect(muralState(post({ id: "a", active: false }), now)).toBe("HIDDEN");
    expect(muralState(post({ id: "a", publishAt: new Date(now.getTime() + 1) }), now)).toBe(
      "SCHEDULED",
    );
    expect(muralState(post({ id: "a", expiresAt: now }), now)).toBe("EXPIRED");
  });

  it("filtra pelo público e ordena fixados, urgentes e recentes", () => {
    const list = visibleMural(
      [
        post({ id: "old", publishAt: new Date(now.getTime() - 3 * day) }),
        post({ id: "new" }),
        post({ id: "urgent", urgent: true, publishAt: new Date(now.getTime() - 5 * day) }),
        post({ id: "pinned", pinned: true, publishAt: new Date(now.getTime() - 9 * day) }),
        post({ id: "otherGroup", audience: "GROUP", audienceId: "g2" }),
        post({ id: "myGroup", audience: "GROUP", audienceId: "g1" }),
        post({ id: "staff", audience: "STAFF" }),
        post({ id: "me", audience: "INDIVIDUAL", audienceId: "r1" }),
        post({ id: "future", publishAt: new Date(now.getTime() + day) }),
      ],
      viewer,
      now,
    ).map((p) => p.id);
    expect(list[0]).toBe("pinned");
    expect(list[1]).toBe("urgent");
    expect(list).toContain("myGroup");
    expect(list).toContain("me");
    expect(list).not.toContain("otherGroup");
    expect(list).not.toContain("staff");
    expect(list).not.toContain("future");
    expect(list.at(-1)).toBe("old");
  });
});

describe("suporte", () => {
  it("resposta da equipe marca respondido; viajante reabre", () => {
    expect(ticketStatusAfterMessage("NEW", "USER")).toBe("ANSWERED");
    expect(ticketStatusAfterMessage("ANSWERED", "PERSON")).toBe("IN_PROGRESS");
    expect(ticketStatusAfterMessage("RESOLVED", "PERSON")).toBe("IN_PROGRESS");
    expect(ticketStatusAfterMessage("NEW", "PERSON")).toBe("NEW");
    expect(ticketAwaitsStaff("NEW")).toBe(true);
    expect(ticketAwaitsStaff("ANSWERED")).toBe(false);
  });
});

describe("documentos do viajante", () => {
  it("usa passaporte em viagem internacional e RG na nacional, ou o configurado", () => {
    const empty = readTravelSettings({});
    expect(requiredDocumentKinds(empty, true)).toEqual(["PASSPORT"]);
    expect(requiredDocumentKinds(empty, false)).toEqual(["RG"]);
    const cfg = readTravelSettings({ travel: { requiredDocuments: ["PASSPORT", "VISA", "VISA"] } });
    expect(requiredDocumentKinds(cfg, false)).toEqual(["PASSPORT", "VISA"]);
  });

  it("tolera configuração inválida", () => {
    expect(readTravelSettings({ travel: { requiredDocuments: "x" } }).requiredDocuments).toEqual(
      [],
    );
    expect(readTravelSettings(null).travelerUploads).toBe(true);
  });

  it("aponta faltando, vencido, vencendo e em dia", () => {
    const tripEnd = new Date(now.getTime() + 10 * day);
    const rows = documentRequirements(
      ["PASSPORT", "VISA", "RG", "INSURANCE"],
      [
        // passaporte vence 3 meses após a volta: precisa de 6
        {
          id: "p",
          kind: "PASSPORT",
          expiresAt: new Date(now.getTime() + 100 * day),
          createdAt: now,
        },
        {
          id: "v-old",
          kind: "VISA",
          expiresAt: new Date(now.getTime() + 400 * day),
          createdAt: new Date(now.getTime() - 9 * day),
        },
        { id: "v", kind: "VISA", expiresAt: new Date(now.getTime() - day), createdAt: now },
        { id: "rg", kind: "RG", expiresAt: null, createdAt: now },
      ],
      tripEnd,
      now,
    );
    expect(rows.map((r) => r.status)).toEqual(["EXPIRING", "EXPIRED", "OK", "MISSING"]);
    expect(rows[1]?.documentId).toBe("v");
    expect(requirementSummary(rows)).toEqual({ ok: 1, total: 4, complete: false });
  });
});

describe("vouchers", () => {
  it("nome de arquivo sem acento e chave estável do lote", () => {
    expect(voucherFileName("Voucher Hotel", "José da Conceição")).toBe(
      "voucher-hotel-jose-da-conceicao.pdf",
    );
    expect(voucherJobKey("p", "t", ["b", "a"])).toBe(voucherJobKey("p", "t", ["a", "b", "a"]));
    expect(voucherJobKey("p", "t", ["a"])).not.toBe(voucherJobKey("p", "t", ["b"]));
    expect(chunkBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
