"use client";

import { Link2, Lock } from "lucide-react";
import { MODULE_KEYS, MODULES, withDependencies, type ModuleKey } from "@mais/core";
import { Badge } from "@/components/ui";
import { Switch } from "@/components/ui/controls";
import { MODULE_UI, moduleLine } from "@/config/modules-ui";
import { cn } from "@/lib/cn";

/**
 * Seletor de módulos. Ligar um módulo liga as dependências; desligar uma
 * dependência desliga quem precisa dela — sempre explicando o porquê.
 */
export function ModulePicker({
  value,
  onChange,
  allowed,
  disabled,
}: {
  value: ModuleKey[];
  onChange: (next: ModuleKey[]) => void;
  allowed: ModuleKey[];
  disabled?: boolean;
}) {
  const selected = new Set(value);
  const allowedSet = new Set(allowed);

  const requiredBy = (m: ModuleKey) =>
    [...selected]
      .filter((s) => s !== m && MODULES[s].requires.includes(m))
      .map((s) => MODULES[s].name);

  function toggle(m: ModuleKey, on: boolean) {
    if (on) {
      onChange([...withDependencies([...selected, m])]);
    } else {
      // remove m e, em cascata, quem depende dele
      const next = new Set(selected);
      next.delete(m);
      let changed = true;
      while (changed) {
        changed = false;
        for (const s of next) {
          if (MODULES[s].requires.some((d) => !next.has(d))) {
            next.delete(s);
            changed = true;
          }
        }
      }
      onChange([...next]);
    }
  }

  return (
    <ul className="divide-border border-border bg-surface divide-y overflow-hidden rounded-md border">
      {MODULE_KEYS.map((m) => {
        const def = MODULES[m];
        const Icon = MODULE_UI[m].icon;
        const inPlan = allowedSet.has(m);
        const on = selected.has(m);
        const needed = on ? requiredBy(m) : [];
        const line = moduleLine(m);
        return (
          <li key={m}>
            <label
              className={cn(
                "flex items-start gap-4 px-4 py-4 transition-colors sm:px-5",
                inPlan && !disabled
                  ? "hover:bg-surface-muted cursor-pointer"
                  : "cursor-not-allowed",
                !inPlan && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-9 shrink-0 place-items-center rounded-md border transition-colors [&_svg]:size-[18px]",
                  on
                    ? "bg-brand-subtle text-brand-subtle-fg border-transparent"
                    : "border-border bg-surface-muted text-fg-subtle",
                )}
              >
                <Icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{def.name}</span>
                  {line && <span className="text-fg-faint text-xs">{line}</span>}
                  {!inPlan && (
                    <Badge size="sm" tone="neutral">
                      <Lock className="size-3" /> Fora do plano
                    </Badge>
                  )}
                </span>
                <span className="text-fg-subtle mt-0.5 block text-sm">{def.summary}</span>
                {def.requires.length > 0 && (
                  <span className="text-fg-faint mt-2 flex items-center gap-1.5 text-xs">
                    <Link2 className="size-3" />
                    Requer {def.requires.map((r) => MODULES[r].name).join(" e ")}
                  </span>
                )}
                {needed.length > 0 && (
                  <span className="text-fg-subtle mt-1 block text-xs">
                    Necessário para {needed.join(", ")} — desligá-lo também desliga esses módulos.
                  </span>
                )}
              </span>
              <Switch
                checked={on}
                disabled={!inPlan || disabled}
                onCheckedChange={(v) => toggle(m, v)}
                aria-label={`${on ? "Desligar" : "Ligar"} ${def.name}`}
                className="mt-1"
              />
            </label>
          </li>
        );
      })}
    </ul>
  );
}
