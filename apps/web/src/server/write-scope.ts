import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Marca a requisição atual como ESCRITA (Server Action ou rota que grava).
 *
 * Quem marca são as bordas: `defineAction` (todas as actions, exceto as
 * declaradas `readOnly`) e `asWrite` (actions/rotas fora do defineAction).
 * Quem decide é `requireWorkspace`/`requireTenant` (server/auth.ts): com o
 * assinante suspenso, qualquer escrita é recusada ali — um único ponto, sem
 * `if` espalhado pelas actions. Páginas e exportações nunca são escrita.
 */
const scope = new AsyncLocalStorage<{ write: true }>();

export function asWrite<T>(fn: () => Promise<T>): Promise<T> {
  return scope.run({ write: true }, fn);
}

export const isWriteRequest = () => scope.getStore()?.write === true;
