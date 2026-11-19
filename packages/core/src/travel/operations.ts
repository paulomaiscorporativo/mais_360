/**
 * Regras operacionais de viagens de grupo: rooming, público segmentado
 * (mural/roteiro), checklist e pendências do viajante. Puro e testado.
 */

// ---------------------------------------------------------------------------
// Rooming
// ---------------------------------------------------------------------------

export type RoomType = "SINGLE" | "DOUBLE" | "TWIN" | "TRIPLE" | "QUAD" | "SUITE" | "OTHER";

export const ROOM_TYPE_OPTIONS: { value: RoomType; label: string; capacity: number }[] = [
  { value: "SINGLE", label: "Single", capacity: 1 },
  { value: "DOUBLE", label: "Duplo (casal)", capacity: 2 },
  { value: "TWIN", label: "Twin (duas camas)", capacity: 2 },
  { value: "TRIPLE", label: "Triplo", capacity: 3 },
  { value: "QUAD", label: "Quádruplo", capacity: 4 },
  { value: "SUITE", label: "Suíte", capacity: 2 },
  { value: "OTHER", label: "Outro", capacity: 4 },
];

export const ROOM_TYPE_LABEL: Record<RoomType, string> = Object.fromEntries(
  ROOM_TYPE_OPTIONS.map((t) => [t.value, t.label]),
) as Record<RoomType, string>;

export function roomCapacity(type: RoomType): number {
  return ROOM_TYPE_OPTIONS.find((t) => t.value === type)?.capacity ?? 2;
}

export type RoomingIssue =
  | { kind: "OVER_CAPACITY"; roomId: string; occupants: number; capacity: number }
  | { kind: "DOUBLE_BOOKED"; registrationId: string; roomIds: string[] };

/**
 * Problemas do rooming dentro de UM hotel: quarto acima da capacidade e a
 * mesma pessoa em dois quartos com datas que se sobrepõem.
 */
export function roomingIssues(
  rooms: {
    id: string;
    type: RoomType;
    checkIn: Date | null;
    checkOut: Date | null;
    occupants: string[];
  }[],
): RoomingIssue[] {
  const issues: RoomingIssue[] = [];
  for (const r of rooms) {
    const cap = roomCapacity(r.type);
    if (r.occupants.length > cap)
      issues.push({
        kind: "OVER_CAPACITY",
        roomId: r.id,
        occupants: r.occupants.length,
        capacity: cap,
      });
  }
  const byPerson = new Map<string, typeof rooms>();
  for (const r of rooms)
    for (const o of r.occupants) byPerson.set(o, [...(byPerson.get(o) ?? []), r]);
  for (const [registrationId, rs] of byPerson) {
    if (rs.length < 2) continue;
    const overlapping = rs.filter((a) =>
      rs.some((b) => b !== a && overlaps(a.checkIn, a.checkOut, b.checkIn, b.checkOut)),
    );
    if (overlapping.length)
      issues.push({ kind: "DOUBLE_BOOKED", registrationId, roomIds: overlapping.map((r) => r.id) });
  }
  return issues;
}

/** Intervalos [a1,a2) e [b1,b2) se sobrepõem. Sem datas = estadia inteira (sobrepõe). */
export function overlaps(a1: Date | null, a2: Date | null, b1: Date | null, b2: Date | null) {
  const s1 = a1?.getTime() ?? -Infinity;
  const e1 = a2?.getTime() ?? Infinity;
  const s2 = b1?.getTime() ?? -Infinity;
  const e2 = b2?.getTime() ?? Infinity;
  return s1 < e2 && s2 < e1;
}

/** Noites entre check-in e check-out (datas de calendário). */
export function nights(checkIn: Date | null, checkOut: Date | null): number {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Público segmentado (mural, roteiro)
// ---------------------------------------------------------------------------

export type SegmentAudience = "ALL" | "STAFF" | "GROUP" | "CATEGORY" | "INDIVIDUAL";

export const AUDIENCE_LABEL: Record<SegmentAudience, string> = {
  ALL: "Todos",
  STAFF: "Só a equipe",
  GROUP: "Um grupo",
  CATEGORY: "Uma categoria",
  INDIVIDUAL: "Uma pessoa",
};

export type AudienceViewer = {
  registrationId: string;
  groupId: string | null;
  categoryId: string | null;
  isStaff: boolean;
};

/** O item segmentado é visível para esta inscrição? */
export function isVisibleTo(
  item: { audience: SegmentAudience; audienceId: string | null },
  viewer: AudienceViewer,
): boolean {
  switch (item.audience) {
    case "ALL":
      return true;
    case "STAFF":
      return viewer.isStaff;
    case "GROUP":
      return viewer.isStaff || (!!item.audienceId && item.audienceId === viewer.groupId);
    case "CATEGORY":
      return viewer.isStaff || (!!item.audienceId && item.audienceId === viewer.categoryId);
    case "INDIVIDUAL":
      return item.audienceId === viewer.registrationId;
  }
}

// ---------------------------------------------------------------------------
// Checklist e tarefas
// ---------------------------------------------------------------------------

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "LATE" | "CANCELED";

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluído",
  LATE: "Atrasado",
  CANCELED: "Cancelado",
};

/** Status exibido: o que passou do prazo sem estar concluído vira "atrasado". */
export function effectiveTaskStatus(
  item: { status: TaskStatus; dueDate: Date | null },
  now = new Date(),
): TaskStatus {
  if (item.status === "DONE" || item.status === "CANCELED") return item.status;
  if (item.dueDate && item.dueDate.getTime() < now.getTime()) return "LATE";
  return item.status === "LATE" ? "PENDING" : item.status;
}

export type ChecklistHistoryEntry = {
  at: string;
  by: string;
  from: TaskStatus;
  to: TaskStatus;
  note?: string;
};

export function appendHistory(
  raw: unknown,
  entry: ChecklistHistoryEntry,
  max = 50,
): ChecklistHistoryEntry[] {
  const list = Array.isArray(raw) ? (raw as ChecklistHistoryEntry[]) : [];
  return [...list, entry].slice(-max);
}

// ---------------------------------------------------------------------------
// Pendências do viajante (o que falta para ele embarcar tranquilo)
// ---------------------------------------------------------------------------

export type TravelerPendency =
  | "NO_FLIGHT"
  | "NO_ROOM"
  | "NO_DOCUMENT"
  | "PASSPORT_EXPIRING"
  | "NO_EMERGENCY_CONTACT"
  | "NO_BIRTHDATE";

export const PENDENCY_LABEL: Record<TravelerPendency, string> = {
  NO_FLIGHT: "Sem voo",
  NO_ROOM: "Sem quarto",
  NO_DOCUMENT: "Sem documento de viagem",
  PASSPORT_EXPIRING: "Passaporte vence em menos de 6 meses",
  NO_EMERGENCY_CONTACT: "Sem contato de emergência",
  NO_BIRTHDATE: "Sem data de nascimento",
};

export function travelerPendencies(
  t: {
    international: boolean;
    hasFlight: boolean;
    hasRoom: boolean;
    flightsEnabled: boolean;
    roomsEnabled: boolean;
    cpf: string;
    rg: string;
    passportNumber: string;
    passportExpiry: Date | null;
    emergencyPhone: string;
    birthDate: Date | null;
  },
  tripEnd: Date | null,
): TravelerPendency[] {
  const out: TravelerPendency[] = [];
  if (t.flightsEnabled && !t.hasFlight) out.push("NO_FLIGHT");
  if (t.roomsEnabled && !t.hasRoom) out.push("NO_ROOM");
  if (t.international) {
    if (!t.passportNumber) out.push("NO_DOCUMENT");
    else if (t.passportExpiry) {
      const limit = new Date((tripEnd ?? new Date()).getTime() + 182 * 86_400_000);
      if (t.passportExpiry.getTime() < limit.getTime()) out.push("PASSPORT_EXPIRING");
    }
  } else if (!t.cpf && !t.rg) out.push("NO_DOCUMENT");
  if (!t.emergencyPhone) out.push("NO_EMERGENCY_CONTACT");
  if (!t.birthDate) out.push("NO_BIRTHDATE");
  return out;
}
