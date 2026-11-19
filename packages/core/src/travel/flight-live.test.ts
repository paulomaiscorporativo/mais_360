import { describe, expect, it } from "vitest";
import {
  inLiveSweepWindow,
  matchLiveRows,
  planLiveRefresh,
  staleFlights,
  normalizeFlightRow,
} from "./flight-live";

const now = new Date("2027-03-10T20:00:00Z");
const h = (n: number) => new Date(now.getTime() + n * 3_600_000);

describe("inLiveSweepWindow", () => {
  it("entra 6 h antes da partida e sai 2 h depois da chegada", () => {
    expect(inLiveSweepWindow(h(7), h(17), now)).toBe(false);
    expect(inLiveSweepWindow(h(5), h(15), now)).toBe(true);
    expect(inLiveSweepWindow(h(-12), h(-1), now)).toBe(true);
    expect(inLiveSweepWindow(h(-12), h(-3), now)).toBe(false);
  });

  it("sem chegada, considera 18 h de voo", () => {
    expect(inLiveSweepWindow(h(-19), null, now)).toBe(true);
    expect(inLiveSweepWindow(h(-21), null, now)).toBe(false);
  });

  it("sem partida, nunca entra", () => {
    expect(inLiveSweepWindow(null, null, now)).toBe(false);
  });
});

describe("planLiveRefresh", () => {
  it("agrupa por data local de partida no fuso da origem e junta números repetidos", () => {
    const groups = planLiveRefresh(
      [
        // 23:55 em São Paulo = 02:55Z do dia 11; a data de operação é 10
        {
          id: "a",
          flightNumber: "tp 82",
          departureAt: new Date("2027-03-11T02:55:00Z"),
          originTimeZone: "America/Sao_Paulo",
        },
        {
          id: "b",
          flightNumber: "TP82",
          departureAt: new Date("2027-03-11T02:55:00Z"),
          originTimeZone: "America/Sao_Paulo",
        },
        {
          id: "c",
          flightNumber: "TP81",
          departureAt: new Date("2027-03-11T10:30:00Z"),
          originTimeZone: "Europe/Lisbon",
        },
      ],
      now,
    );
    expect(groups).toEqual([
      { date: "2027-03-10", flightIds: ["a", "b"], numbers: ["TP82"] },
      { date: "2027-03-11", flightIds: ["c"], numbers: ["TP81"] },
    ]);
  });

  it("partida longe demais vai sem data (operação atual/próxima)", () => {
    const groups = planLiveRefresh(
      [{ id: "x", flightNumber: "LA8065", departureAt: h(24 * 30), originTimeZone: "UTC" }],
      now,
    );
    expect(groups).toEqual([{ date: "", flightIds: ["x"], numbers: ["LA8065"] }]);
  });

  it("ignora voo sem número", () => {
    expect(
      planLiveRefresh([{ id: "x", flightNumber: " ", departureAt: h(1), originTimeZone: "UTC" }]),
    ).toEqual([]);
  });
});

describe("matchLiveRows", () => {
  it("casa pelo número pedido e marca sem dados quando a fonte não devolve", () => {
    const out = matchLiveRows(
      [
        { id: "a", flightNumber: "TP 82" },
        { id: "b", flightNumber: "TP81" },
      ],
      [{ requestedFlight: "tp82", isAirborne: true, originIata: "GRU" }],
      now,
    );
    expect(out.get("a")?.phase).toBe("AIRBORNE");
    expect(out.get("a")?.origin.iata).toBe("GRU");
    expect(out.get("b")?.phase).toBe("NO_DATA");
  });
});

describe("staleFlights", () => {
  const base = { flightNumber: "TP82", departureAt: h(30), liveData: null };

  it("sem consulta anterior, está vencido", () => {
    expect(staleFlights([{ ...base, liveCheckedAt: null }], { now })).toHaveLength(1);
  });

  it("forçar ainda respeita 60 s", () => {
    const recent = { ...base, liveCheckedAt: new Date(now.getTime() - 30_000) };
    expect(staleFlights([recent], { force: true, now })).toHaveLength(0);
    const older = { ...base, liveCheckedAt: new Date(now.getTime() - 90_000) };
    expect(staleFlights([older], { force: true, now })).toHaveLength(1);
  });

  it("em voo, o cache vale 3 min", () => {
    const live = normalizeFlightRow({ isAirborne: true }, now);
    const f = { ...base, liveData: live, liveCheckedAt: new Date(now.getTime() - 4 * 60_000) };
    expect(staleFlights([f], { now })).toHaveLength(1);
  });
});
