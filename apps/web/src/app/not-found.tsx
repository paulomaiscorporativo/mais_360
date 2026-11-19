import Link from "next/link";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="bg-canvas grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="text-fg-subtle font-mono text-sm">404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Página não encontrada</h1>
        <p className="text-md text-fg-muted mt-2">
          O endereço pode ter mudado, ou você não tem acesso a este conteúdo.
        </p>
        <div className="mt-8 flex justify-center">
          <Button asChild variant="secondary">
            <Link href="/">Voltar ao início</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
