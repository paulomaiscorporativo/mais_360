"use client";

import { RotateCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-[60dvh] place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Não foi possível carregar esta página
        </h1>
        <p className="text-fg-muted mt-2 text-base">
          Já registramos o problema. Tente de novo; se continuar, fale com o suporte
          {error.digest ? ` informando o código ${error.digest}` : ""}.
        </p>
        <div className="mt-6 flex justify-center">
          <Button onClick={reset} variant="secondary">
            <RotateCw /> Tentar de novo
          </Button>
        </div>
      </div>
    </main>
  );
}
