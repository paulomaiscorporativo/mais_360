"use client";

import { Field, Input } from "@/components/ui";
import { TERM_DEFS } from "@/config/terms";
import { cn } from "@/lib/cn";

export function TermsFields({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {TERM_DEFS.map((d) => (
        <Field key={d.key} label={d.label}>
          {({ id }) => (
            <div className="flex flex-col gap-2">
              <Input
                id={id}
                value={value[d.key] ?? ""}
                placeholder={d.default}
                maxLength={60}
                onChange={(e) => onChange({ ...value, [d.key]: e.target.value })}
              />
              <div className="flex flex-wrap gap-1.5">
                {d.examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => onChange({ ...value, [d.key]: ex })}
                    className={cn(
                      "h-6 rounded-full border px-2.5 text-xs transition-colors",
                      value[d.key] === ex
                        ? "bg-brand-subtle text-brand-subtle-fg border-transparent"
                        : "border-border text-fg-subtle hover:border-border-strong hover:text-fg",
                    )}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>
      ))}
    </div>
  );
}
