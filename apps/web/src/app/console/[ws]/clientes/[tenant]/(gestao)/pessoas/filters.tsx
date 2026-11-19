"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui";
import { Select } from "@/components/ui/controls";

export function PeopleFilters({ q: initial, tipo, memberLabel }: { q: string; tipo: string; memberLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(initial);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  useEffect(() => {
    if (q === initial) return;
    const t = setTimeout(() => setParam("q", q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, e-mail, empresa, CPF ou telefone"
          leading={<Search />}
          trailing={
            q && (
              <button type="button" onClick={() => setQ("")} className="hover:text-fg rounded p-1" aria-label="Limpar busca">
                <X className="size-3.5" />
              </button>
            )
          }
          aria-label="Buscar pessoas"
        />
      </div>
      <Select
        value={tipo || "todos"}
        onValueChange={(v) => setParam("tipo", v === "todos" ? "" : v)}
        options={[
          { value: "todos", label: "Todas as pessoas" },
          { value: "membros", label: memberLabel },
        ]}
        className="sm:w-52"
      />
    </div>
  );
}
