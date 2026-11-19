import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { monorepoRoot } from "./load-env";

/**
 * Armazenamento de arquivos atrás de uma interface: disco local agora
 * (STORAGE_DIR, fora da pasta do deploy), S3 compatível depois — basta
 * implementar o mesmo contrato e escolher pelo ambiente.
 */
export interface StorageDriver {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

class LocalDriver implements StorageDriver {
  constructor(private readonly dir: string) {}

  private resolve(key: string) {
    // Chaves são geradas pelo servidor; a checagem impede escapar da pasta.
    const full = path.resolve(this.dir, key);
    if (!full.startsWith(path.resolve(this.dir) + path.sep)) throw new Error("Chave inválida.");
    return full;
  }

  async put(key: string, body: Uint8Array) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string) {
    try {
      return await readFile(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async remove(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (!driver) {
    const raw = process.env.STORAGE_DIR?.trim() || "./storage";
    const dir = path.isAbsolute(raw) ? raw : path.resolve(monorepoRoot(), raw);
    driver = new LocalDriver(dir);
  }
  return driver;
}
