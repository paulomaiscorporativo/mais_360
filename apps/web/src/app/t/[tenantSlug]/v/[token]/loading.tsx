import { Skeleton } from "@/components/ui";

/** Esqueleto do portal: capa da marca e seções, sem spinner. */
export default function Loading() {
  return (
    <div className="bg-surface-muted min-h-dvh" aria-busy="true" aria-label="Carregando sua viagem">
      <div className="bg-brand h-64" />
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-5 sm:px-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-border bg-surface rounded-lg border p-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-4 h-20 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
