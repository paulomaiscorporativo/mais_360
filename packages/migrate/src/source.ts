import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/**
 * Leitura do banco SQLite do legado (ABIEC/ABRADILAN), SEMPRE somente leitura.
 * Usa `node:sqlite` (Node ≥ 22.13), sem dependência nativa.
 *
 * As duas bases têm o mesmo schema, com pequenas diferenças de versão (a
 * ABRADILAN não tem as colunas de status ao vivo do voo): coluna ausente
 * devolve o valor padrão, nunca quebra a leitura.
 */

type Raw = Record<string, unknown>;

export class Row {
  constructor(private readonly raw: Raw) {}

  has(col: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.raw, col);
  }

  str(col: string): string {
    const v = this.raw[col];
    return v === null || v === undefined ? "" : String(v);
  }

  /** Texto opcional: vazio vira null (chaves estrangeiras). */
  ref(col: string): string | null {
    const v = this.str(col).trim();
    return v ? v : null;
  }

  num(col: string, fallback = 0): number {
    const v = this.raw[col];
    if (v === null || v === undefined || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  int(col: string): number | null {
    const v = this.raw[col];
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isInteger(n) ? n : null;
  }

  bool(col: string, fallback = false): boolean {
    const v = this.raw[col];
    if (v === null || v === undefined) return fallback;
    return v === 1 || v === 1n || v === true || v === "1" || v === "true";
  }

  /** Valor bruto de data (ms ou texto), para as conversões de `rules/values`. */
  date(col: string): unknown {
    return this.raw[col] ?? null;
  }
}

export const LEGACY_TABLES = [
  "User",
  "UserTripAccess",
  "Trip",
  "TripGroup",
  "Passenger",
  "PassengerDocument",
  "Airline",
  "Airport",
  "Flight",
  "FlightLocator",
  "FlightPassenger",
  "Accommodation",
  "AccommodationPassenger",
  "ItineraryItem",
  "ChecklistItem",
  "MuralPost",
  "Ticket",
  "TicketMessage",
  "TripDocument",
  "VoucherTemplate",
  "ActivityLog",
  "Associate",
  "AssociateInvite",
  "TravelRequest",
  "TravelRequestEvent",
  "TravelQuote",
  "TravelSegment",
  "TravelPassenger",
  "EventCompany",
  "EventTable",
  "Invite",
  "InviteDelivery",
] as const;

export type LegacyTable = (typeof LEGACY_TABLES)[number];

/** Ordem estável de leitura: reexecuções processam tudo na mesma sequência. */
const ORDER: Partial<Record<LegacyTable, string>> = {
  UserTripAccess: `"userId", "tripId"`,
  FlightPassenger: `"flightId", "passengerId"`,
  AccommodationPassenger: `"accommodationId", "passengerId"`,
  Airline: `"code"`,
  Airport: `"iata"`,
};

export class LegacySource {
  private readonly db: DatabaseSync;
  private readonly tables: Set<string>;
  private readonly cache = new Map<LegacyTable, Row[]>();

  constructor(readonly path: string) {
    if (!existsSync(path)) throw new Error(`Arquivo do legado não encontrado: ${path}`);
    this.db = new DatabaseSync(path, { readOnly: true });
    const rows = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    this.tables = new Set(rows.map((r) => String((r as Raw).name)));
    if (!this.tables.has("Trip") || !this.tables.has("Passenger")) {
      this.db.close();
      throw new Error(
        "O arquivo não parece ser um banco da plataforma ABIEC/ABRADILAN (faltam as tabelas Trip/Passenger).",
      );
    }
  }

  hasTable(table: LegacyTable): boolean {
    return this.tables.has(table);
  }

  columns(table: LegacyTable): string[] {
    if (!this.hasTable(table)) return [];
    return this.db
      .prepare(`PRAGMA table_info("${table}")`)
      .all()
      .map((r) => String((r as Raw).name));
  }

  rows(table: LegacyTable): Row[] {
    const hit = this.cache.get(table);
    if (hit) return hit;
    if (!this.hasTable(table)) {
      this.cache.set(table, []);
      return [];
    }
    const cols = new Set(this.columns(table));
    const order =
      ORDER[table] ??
      (cols.has("createdAt") ? `"createdAt", "id"` : cols.has("id") ? `"id"` : "rowid");
    const out = this.db
      .prepare(`SELECT * FROM "${table}" ORDER BY ${order}`)
      .all()
      .map((r) => new Row(r as Raw));
    this.cache.set(table, out);
    return out;
  }

  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of LEGACY_TABLES) out[t] = this.rows(t).length;
    return out;
  }

  close() {
    this.db.close();
  }
}
