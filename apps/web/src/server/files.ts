import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { FileVisibility } from "@mais/db";
import { prisma } from "./db";
import { AppError } from "./errors";
import { storage } from "./storage";

/**
 * Upload e leitura de arquivos. O tipo é conferido pelos primeiros bytes do
 * conteúdo (não pela extensão nem pelo que o navegador declara) e cada
 * arquivo guarda o SHA-256 em StoredFile.
 */

export const FILE_KINDS = {
  image: ["image/png", "image/jpeg", "image/webp"],
  pdf: ["application/pdf"],
  document: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
} as const;

export type FileKind = keyof typeof FILE_KINDS;

const MB = 1024 * 1024;
export const MAX_BYTES: Record<FileKind, number> = {
  image: 5 * MB,
  pdf: 20 * MB,
  document: 20 * MB,
};

/** Tipo real pelo conteúdo ("magic bytes"). */
export function sniffMime(buf: Uint8Array): string | null {
  const b = (i: number) => buf[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return "application/pdf";
  if (
    b(0) === 0x52 &&
    b(1) === 0x49 &&
    b(2) === 0x46 &&
    b(3) === 0x46 &&
    b(8) === 0x57 &&
    b(9) === 0x45 &&
    b(10) === 0x42 &&
    b(11) === 0x50
  )
    return "image/webp";
  return null;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function safeName(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w.\- ]+/g, "")
      .trim()
      .slice(0, 120) || "arquivo"
  );
}

export async function saveUpload(input: {
  tenantId: string | null;
  file: File;
  kind: FileKind;
  visibility: FileVisibility;
  uploadedBy: string;
}) {
  const { file, kind } = input;
  if (!file || file.size === 0) throw new AppError("Escolha um arquivo.");
  if (file.size > MAX_BYTES[kind]) {
    throw new AppError(
      `O arquivo passa de ${Math.round(MAX_BYTES[kind] / MB)} MB. Envie um menor.`,
    );
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(buf);
  const allowed = FILE_KINDS[kind] as readonly string[];
  if (!mime || !allowed.includes(mime)) {
    throw new AppError(
      kind === "image"
        ? "Envie uma imagem PNG, JPG ou WebP."
        : kind === "pdf"
          ? "Envie um arquivo PDF."
          : "Envie um PDF ou uma imagem (PNG, JPG, WebP).",
    );
  }
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const key = `${input.tenantId ?? "plataforma"}/${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString("hex")}.${EXT[mime]}`;
  await storage().put(key, buf, mime);
  return prisma.storedFile.create({
    data: {
      tenantId: input.tenantId,
      storageKey: key,
      fileName: safeName(file.name),
      mimeType: mime,
      size: buf.byteLength,
      sha256,
      visibility: input.visibility,
      uploadedBy: input.uploadedBy,
    },
  });
}

/** URL pública/autenticada de um arquivo (servida por /api/files/[id]). */
export function fileUrl(id: string | null | undefined): string | null {
  return id ? `/api/files/${id}` : null;
}

export async function readStoredFile(id: string) {
  const meta = await prisma.storedFile.findUnique({ where: { id } });
  if (!meta) return null;
  const body = await storage().get(meta.storageKey);
  if (!body) return null;
  return { meta, body };
}
