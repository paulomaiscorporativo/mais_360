import { describe, expect, it } from "vitest";
import {
  appendHistory,
  countdown,
  dayOffset,
  effectiveTaskStatus,
  formatDuration,
  isVisibleTo,
  liveCacheTtlMs,
  normalizeFlightRow,
  parseFlightLive,
  parseLocalDateTime,
  roomingIssues,
  staleFlights,
  toLocalInput,
  travelerPendencies,
  AIRPORTS,
  AIRPORT_TIMEZONE,
} from "./index";

describe("datas locais de viagem", () => {
  it("guarda o instante UTC certo a partir do horário local do aeroporto", () => {
    const dep = parseLocalDateTime("2026-12-01T21:40", "America/Sao_Paulo")!;
    expect(dep.toISOString()).toBe("2026-12-02T00:40:00.000Z");
    const arr = parseLocalDateTime("2026-12-02T11:05", "Europe/Lisbon")!;
    expect(arr.toISOString()).toBe("2026-12-02T11:05:00.000Z");
    expect(formatDuration(dep, arr)).toBe("10h25");
    expect(dayOffset(dep, "America/Sao_Paulo", arr, "Europe/Lisbon")).toBe(1);
  });

  it("volta para o input no mesmo fuso", () => {
    const d = parseLocalDateTime("2026-07-10T08:15", "Europe/Madrid")!;
    expect(toLocalInput(d, "Europe/Madrid")).toBe("2026-07-10T08:15");
  });

  it("recusa valores inválidos", () => {
    expect(parseLocalDateTime("2026-13-01T10:00", "UTC")).toBeNull();
    expect(parseLocalDateTime("ontem", "UTC")).toBeNull();
  });

  it("contagem regressiva", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    expect(countdown(new Date("2026-11-03T15:30:00Z"), now)).toEqual({
      past: false,
      days: 2,
      hours: 3,
      minutes: 30,
    });
    expect(countdown(new Date("2026-10-01T00:00:00Z"), now).past).toBe(true);
  });

  it("todo aeroporto do catálogo tem fuso válido", () => {
    for (const [iata, , , , tz] of AIRPORTS) {
      expect(() => new Intl.DateTimeFormat("en", { timeZone: tz }), iata).not.toThrow();
    }
    expect(AIRPORT_TIMEZONE.get("LIS")).toBe("Europe/Lisbon");
  });
});

describe("status de voo ao vivo", () => {
  it("normaliza a linha da fonte", () => {
    const live = normalizeFlightRow({
      flightStatus: "En Route",
      isAirborne: true,
      originIata: "GRU",
      destinationIata: "LIS",
      originGate: "B12",
      departureDelayMinutes: 20,
      originDelayNotes: ["Tráfego"],
    });
    expect(live.phase).toBe("AIRBORNE");
    expect(live.origin.gate).toBe("B12");
    expect(live.origin.delayMinutes).toBe(20);
    expect(live.notes).toEqual(["Tráfego"]);
  });

  it("prioriza cancelado e atraso ≥ 15 min", () => {
    expect(normalizeFlightRow({ isCancelled: true, isAirborne: true }).phase).toBe("CANCELED");
    expect(normalizeFlightRow({ departureDelayMinutes: 15 }).phase).toBe("DELAYED");
    expect(normalizeFlightRow({ departureDelayMinutes: 10 }).phase).toBe("SCHEDULED");
    expect(normalizeFlightRow({ resultUnknown: true }).phase).toBe("NO_DATA");
  });

  it("ignora Json inválido", () => {
    expect(parseFlightLive({ phase: "X" })).toBeNull();
    expect(parseFlightLive("texto")).toBeNull();
  });

  it("cache curto em voo, longo após o pouso", () => {
    const now = new Date("2026-12-02T03:00:00Z");
    const airborne = normalizeFlightRow({ isAirborne: true });
    const landed = normalizeFlightRow({ hasLanded: true });
    expect(liveCacheTtlMs(airborne, null, now)).toBe(3 * 60_000);
    expect(liveCacheTtlMs(landed, null, now)).toBe(60 * 60_000);
    expect(liveCacheTtlMs(null, null, now)).toBe(0);
  });

  it("seleciona só os voos com cache vencido", () => {
    const now = new Date("2026-12-02T03:00:00Z");
    const fresh = {
      id: "a",
      flightNumber: "LA8084",
      departureAt: null,
      liveCheckedAt: new Date(now.getTime() - 60_000),
      liveData: normalizeFlightRow({ hasLanded: true }),
    };
    const never = { ...fresh, id: "b", liveCheckedAt: null };
    const noNumber = { ...never, id: "c", flightNumber: " " };
    expect(staleFlights([fresh, never, noNumber], { now }).map((f) => f.id)).toEqual(["b"]);
  });
});

describe("rooming", () => {
  it("aponta quarto acima da capacidade e pessoa em dois quartos", () => {
    const issues = roomingIssues([
      { id: "r1", type: "DOUBLE", checkIn: null, checkOut: null, occupants: ["a", "b", "c"] },
      { id: "r2", type: "SINGLE", checkIn: null, checkOut: null, occupants: ["a"] },
    ]);
    expect(issues).toContainEqual({
      kind: "OVER_CAPACITY",
      roomId: "r1",
      occupants: 3,
      capacity: 2,
    });
    expect(issues.find((i) => i.kind === "DOUBLE_BOOKED")).toMatchObject({ registrationId: "a" });
  });

  it("mesma pessoa em quartos sem sobreposição de datas é válida", () => {
    const d = (s: string) => new Date(s);
    const issues = roomingIssues([
      {
        id: "r1",
        type: "SINGLE",
        checkIn: d("2026-12-01"),
        checkOut: d("2026-12-04"),
        occupants: ["a"],
      },
      {
        id: "r2",
        type: "SINGLE",
        checkIn: d("2026-12-04"),
        checkOut: d("2026-12-07"),
        occupants: ["a"],
      },
    ]);
    expect(issues).toEqual([]);
  });
});

describe("público segmentado", () => {
  const viewer = { registrationId: "r1", groupId: "g1", categoryId: "c1", isStaff: false };
  it("respeita grupo, categoria, equipe e individual", () => {
    expect(isVisibleTo({ audience: "ALL", audienceId: null }, viewer)).toBe(true);
    expect(isVisibleTo({ audience: "STAFF", audienceId: null }, viewer)).toBe(false);
    expect(isVisibleTo({ audience: "GROUP", audienceId: "g1" }, viewer)).toBe(true);
    expect(isVisibleTo({ audience: "GROUP", audienceId: "g2" }, viewer)).toBe(false);
    expect(isVisibleTo({ audience: "CATEGORY", audienceId: "c1" }, viewer)).toBe(true);
    expect(isVisibleTo({ audience: "INDIVIDUAL", audienceId: "r1" }, viewer)).toBe(true);
    expect(isVisibleTo({ audience: "INDIVIDUAL", audienceId: "r2" }, viewer)).toBe(false);
  });
});

describe("checklist", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  it("marca atrasado o que venceu sem concluir", () => {
    expect(effectiveTaskStatus({ status: "PENDING", dueDate: new Date("2026-11-19") }, now)).toBe(
      "LATE",
    );
    expect(effectiveTaskStatus({ status: "DONE", dueDate: new Date("2026-11-19") }, now)).toBe(
      "DONE",
    );
    expect(effectiveTaskStatus({ status: "IN_PROGRESS", dueDate: null }, now)).toBe("IN_PROGRESS");
  });
  it("histórico limitado", () => {
    const h = appendHistory([], { at: "x", by: "a", from: "PENDING", to: "DONE" });
    expect(h).toHaveLength(1);
    expect(appendHistory("lixo", h[0]!)).toHaveLength(1);
  });
});

describe("pendências do viajante", () => {
  const base = {
    international: true,
    hasFlight: true,
    hasRoom: true,
    flightsEnabled: true,
    roomsEnabled: true,
    cpf: "",
    rg: "",
    passportNumber: "FX123456",
    passportExpiry: new Date("2030-01-01"),
    emergencyPhone: "5511999990000",
    birthDate: new Date("1980-01-01"),
  };
  it("sem pendência quando está tudo certo", () => {
    expect(travelerPendencies(base, new Date("2026-12-10"))).toEqual([]);
  });
  it("passaporte vencendo em menos de 6 meses após a volta", () => {
    expect(
      travelerPendencies(
        { ...base, passportExpiry: new Date("2027-03-01") },
        new Date("2026-12-10"),
      ),
    ).toEqual(["PASSPORT_EXPIRING"]);
  });
  it("nacional pede CPF ou RG; recursos desligados não geram pendência", () => {
    expect(
      travelerPendencies(
        {
          ...base,
          international: false,
          passportNumber: "",
          hasFlight: false,
          flightsEnabled: false,
        },
        null,
      ),
    ).toEqual(["NO_DOCUMENT"]);
  });
});
