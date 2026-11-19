/**
 * Migração dos portais ABIEC/ABRADILAN (SQLite) para a Plataforma Mais.
 *
 *   npm run migrate:legacy -- --source <arquivo.db> --tenant <slug> [--dry-run]
 *        [--only nucleo,projetos,…] [--files <pasta de uploads do legado>]
 *        [--prefix abiec] [--report <arquivo.json>]
 *
 * Destino: DATABASE_URL (do ambiente ou do .env da raiz). Guia: docs/MIGRACAO.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { STEPS, type Step } from "./context";
import { formatReport } from "./report";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
// Variáveis já definidas no ambiente prevalecem sobre o .env
loadEnv({ path: path.join(root, ".env") });

const HELP = `Uso: npm run migrate:legacy -- --source <arquivo.db> --tenant <slug> [opções]

  --source <arquivo>   banco SQLite do legado (aberto somente para leitura)
  --tenant <slug>      cliente de destino (precisa existir: abiec, abradilan…)
  --dry-run            simula tudo e reverte (nada é gravado nem copiado)
  --only <etapas>      só estas etapas, separadas por vírgula:
                       ${STEPS.join(", ")}
  --files <pasta>      uploads do legado (padrão: <app>/storage ao lado de prisma/)
  --prefix <texto>     prefixo das chaves de origem (padrão: slug do cliente)
  --report <arquivo>   onde gravar o relatório JSON (padrão: tmp/migracao/)
`;

type Args = Record<string, string | true>;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) throw new Error(`Argumento inesperado: ${a}`);
    const [name, inline] = a.slice(2).split("=", 2) as [string, string | undefined];
    if (inline !== undefined) out[name] = inline;
    else if (argv[i + 1] && !argv[i + 1]!.startsWith("--")) out[name] = argv[++i]!;
    else out[name] = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.source || !args.tenant) {
    console.log(HELP);
    process.exit(args.help ? 0 : 1);
  }
  // Caminhos relativos ao diretório de onde o comando foi chamado (npm -w muda o cwd)
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const resolve = (p: string) => (path.isAbsolute(p) ? p : path.resolve(cwd, p));
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : undefined);

  let only: Step[] | undefined;
  if (str("only")) {
    only = str("only")!
      .split(",")
      .map((s) => s.trim()) as Step[];
    const bad = only.filter((s) => !(STEPS as readonly string[]).includes(s));
    if (bad.length)
      throw new Error(`Etapa desconhecida: ${bad.join(", ")}. Use: ${STEPS.join(", ")}.`);
  }

  const storageRaw = process.env.STORAGE_DIR?.trim() || "./storage";
  const storageDir = path.isAbsolute(storageRaw) ? storageRaw : path.resolve(root, storageRaw);

  // Import tardio: o cliente Prisma lê DATABASE_URL ao ser criado
  const { prisma } = await import("@mais/db");
  const { runMigration, describeDatabaseUrl } = await import("./migrate");
  const target = describeDatabaseUrl(process.env.DATABASE_URL);
  const dryRun = args["dry-run"] === true;
  console.log(
    `${dryRun ? "Simulando" : "Migrando"} ${str("source")} → cliente "${str("tenant")}" em ${target}…`,
  );

  const report = await runMigration({
    prisma,
    source: resolve(str("source")!),
    tenant: str("tenant")!,
    prefix: str("prefix"),
    dryRun,
    only,
    filesDir: str("files") ? resolve(str("files")!) : undefined,
    storageDir,
    encryptionKey: process.env.ENCRYPTION_KEY,
    target,
  });
  await prisma.$disconnect();

  const stamp = report.startedAt.replace(/[:.]/g, "-");
  const file = str("report")
    ? resolve(str("report")!)
    : path.join(
        root,
        "tmp",
        "migracao",
        `${report.tenant}-${stamp}${dryRun ? "-simulacao" : ""}.json`,
      );
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(report, null, 2));

  console.log(formatReport(report));
  console.log(`Relatório completo: ${file}`);
  process.exit(report.ok ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
