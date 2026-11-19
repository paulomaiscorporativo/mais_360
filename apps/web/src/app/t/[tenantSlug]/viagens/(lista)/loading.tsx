import { Skeleton } from "@/components/ui";

/** Esqueleto da área do associado (cabeçalho da marca + lista). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="mx-auto w-full max-w-3xl sm:mt-8">
      <Skeleton className="h-44 rounded-none sm:rounded-t-lg" />
      <div className="flex flex-col gap-3 px-5 py-8 sm:px-10">
        <Skeleton className="h-6 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}
