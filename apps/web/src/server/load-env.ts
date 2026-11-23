import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * O .env fica na raiz do monorepo (compartilhado com Prisma e worker). O Next
 * só lê .env da pasta do app, e os workers de build não herdam o que o
 * next.config carrega — então todo ponto de entrada do servidor chama isto.
 *
 * A leitura é própria (não usa o @next/env): o Next guarda em cache o .env que
 * ele mesmo carregou e, no modo dev, restaura o process.env original a cada
 * recompilação, apagando o que viesse da raiz. Por isso a busca da raiz é
 * memorizada, mas as variáveis são reaplicadas a cada chamada (barato: só
 * preenche o que estiver faltando).
 *
 * Variáveis já definidas no ambiente (produção, CI) têm precedência.
 */
let root: string | null | undefined;
let parsed: Record<string, string> | undefined;

function findRoot(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        if (JSON.parse(fs.readFileSync(pkg, "utf8")).workspaces) return dir;
      } catch {
        /* package.json ilegível: continua subindo */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readRootEnv(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Ordem de precedência do Next: .env.local vence .env
  for (const file of [".env", ".env.local"]) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) continue;
    try {
      Object.assign(out, parseEnv(fs.readFileSync(full, "utf8")));
    } catch (err) {
      console.error(`Falha ao ler ${full}`, err);
    }
  }
  return out;
}

/** Raiz do monorepo (pasta do package.json com "workspaces"); cwd se não achar. */
export function monorepoRoot(): string {
  if (root === undefined) root = findRoot();
  return root ?? process.cwd();
}

export function loadMonorepoEnv() {
  if (parsed === undefined) {
    monorepoRoot();
    parsed = root ? readRootEnv(root) : {};
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined || process.env[key] === "") process.env[key] = value;
  }
}
