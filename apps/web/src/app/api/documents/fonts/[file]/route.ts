import { CSS_FAMILIES, fontBytes } from "@mais/documents";
import "@/server/documents"; // define DOCUMENTS_FONTS_DIR

// Fontes do motor (OFL) para a pré-visualização do editor. Públicas e imutáveis.
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!(file in CSS_FAMILIES)) return new Response("Não encontrado", { status: 404 });
  return new Response(Buffer.from(fontBytes(file)), {
    headers: {
      "Content-Type": "font/ttf",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
