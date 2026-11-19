"use client";

import { AUDIENCE_LABEL, type SegmentAudience } from "@mais/core";
import { Select } from "@/components/ui/controls";

export type AudienceOptions = {
  groups: { id: string; name: string; color: string }[];
  categories: { id: string; name: string; color: string }[];
  people: { id: string; name: string }[];
};

/** Para quem o item aparece: todos, equipe, um grupo, uma categoria ou uma pessoa. */
export function AudiencePicker({
  audience,
  audienceId,
  onChange,
  options,
  allowStaff = true,
  error,
}: {
  audience: SegmentAudience;
  audienceId: string | null;
  onChange: (audience: SegmentAudience, audienceId: string | null) => void;
  options: AudienceOptions;
  allowStaff?: boolean;
  error?: string;
}) {
  const kinds: SegmentAudience[] = [
    "ALL",
    ...(allowStaff ? (["STAFF"] as const) : []),
    ...(options.groups.length ? (["GROUP"] as const) : []),
    ...(options.categories.length ? (["CATEGORY"] as const) : []),
    "INDIVIDUAL",
  ];
  const targets =
    audience === "GROUP"
      ? options.groups
      : audience === "CATEGORY"
        ? options.categories
        : audience === "INDIVIDUAL"
          ? options.people
          : [];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Quem vê</span>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          value={audience}
          onValueChange={(v) => {
            const a = v as SegmentAudience;
            const first =
              a === "GROUP"
                ? options.groups[0]?.id
                : a === "CATEGORY"
                  ? options.categories[0]?.id
                  : null;
            onChange(a, first ?? null);
          }}
          options={kinds.map((k) => ({ value: k, label: AUDIENCE_LABEL[k] }))}
        />
        {targets.length > 0 && (
          <Select
            value={audienceId ?? undefined}
            placeholder="Escolha"
            onValueChange={(v) => onChange(audience, v)}
            options={targets.map((t) => ({ value: t.id, label: t.name }))}
          />
        )}
      </div>
      {error && <p className="text-danger text-xs font-medium">{error}</p>}
    </div>
  );
}

export function audienceLabel(
  audience: SegmentAudience,
  audienceId: string | null,
  options: AudienceOptions,
): string {
  if (audience === "GROUP")
    return `Grupo ${options.groups.find((g) => g.id === audienceId)?.name ?? "?"}`;
  if (audience === "CATEGORY")
    return options.categories.find((c) => c.id === audienceId)?.name ?? "Categoria";
  if (audience === "INDIVIDUAL")
    return options.people.find((p) => p.id === audienceId)?.name ?? "Uma pessoa";
  return AUDIENCE_LABEL[audience];
}
