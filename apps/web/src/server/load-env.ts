import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * O .env fica na raiz do monorepo (compartilhado com Prisma e worker). O Next
 * só lê .env da pasta do app, e os workers de build não herdam o que o
 * next.config carrega — então todo ponto de entrada do servidor chama isto.
 * Procura subindo a partir do diretório atual o package.json com "workspaces".
 * Variáveis já definidas no ambiente (produção) têm precedência.
 */
let loaded = false;
let root: string | null = null;

/** Raiz do monorepo (pasta do package.json com "workspaces"); cwd se não achar. */
export function monorepoRoot(): string {
  loadMonorepoEnv();
  return root ?? process.cwd();
}

export function loadMonorepoEnv() {
  if (loaded) return;
  loaded = true;
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        if (JSON.parse(fs.readFileSync(pkg, "utf8")).workspaces) {
          root = dir;
          if (dir !== process.cwd()) loadEnvConfig(dir, process.env.NODE_ENV !== "production");
          return;
        }
      } catch {
        /* package.json ilegível: continua subindo */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
