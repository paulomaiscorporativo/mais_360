"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** Grupo de opções em cartão (radio acessível), para escolhas com explicação. */
export function ChoiceCards<V extends string>({
  value,
  onChange,
  options,
  columns = 3,
  label,
  disabled,
}: {
  value: V;
  onChange: (v: V) => void;
  options: {
    value: V;
    title: React.ReactNode;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    badge?: React.ReactNode;
    disabled?: boolean;
  }[];
  columns?: 1 | 2 | 3;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "grid gap-2",
        columns === 3 && "sm:grid-cols-3",
        columns === 2 && "sm:grid-cols-2",
      )}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
              e.preventDefault();
              const enabled = options.filter((x) => !x.disabled);
              const i = enabled.findIndex((x) => x.value === value);
              const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
              const next = enabled[(i + step + enabled.length) % enabled.length];
              if (next) onChange(next.value);
            }}
            tabIndex={checked ? 0 : -1}
            className={cn(
              "group relative flex items-start gap-3 rounded-md border p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-150",
              "focus-visible:outline-brand-ring focus-visible:outline-2 focus-visible:outline-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              checked
                ? "border-brand bg-brand-subtle/50 shadow-[0_0_0_1px_var(--brand)]"
                : "border-border-strong bg-surface hover:border-fg-faint/70",
            )}
          >
            {o.icon && (
              <span
                className={cn(
                  "mt-0.5 shrink-0 [&_svg]:size-[18px]",
                  checked ? "text-brand-text" : "text-fg-subtle",
                )}
              >
                {o.icon}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {o.title}
                {o.badge}
              </span>
              {o.description && (
                <span className="text-fg-subtle mt-0.5 block text-xs leading-relaxed">
                  {o.description}
                </span>
              )}
            </span>
            <span
              aria-hidden
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                checked ? "border-brand bg-brand text-brand-fg" : "border-border-strong",
              )}
            >
              {checked && <Check className="size-2.5" strokeWidth={3.5} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
