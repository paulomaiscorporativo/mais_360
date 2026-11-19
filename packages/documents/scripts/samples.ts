/**
 * Gera amostras dos modelos padrão em packages/documents/samples/ para revisão
 * visual:  npm run samples -w @mais/documents
 *
 * Logos opcionais: SAMPLE_LOGO (PNG claro, para fundo escuro) e
 * SAMPLE_LOGO_DARK; sem eles, os modelos usam o nome do evento.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BADGE_A6,
  LABEL_80X40,
  SAMPLE_REGISTRATION,
  SAMPLE_TRAVELER,
  VOUCHER_A4,
  parseDefinition,
  type DocumentData,
} from "@mais/core";
import {
  renderCalibrationHtml,
  renderPdf,
  renderThermalHtml,
  type AssetLoader,
} from "../src/index";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "samples");
mkdirSync(out, { recursive: true });

const logo = process.env.SAMPLE_LOGO;
const loadAsset: AssetLoader = async (id) =>
  id === "logo" && logo && existsSync(logo)
    ? { bytes: new Uint8Array(readFileSync(logo)), mimeType: "image/png" }
    : null;
const withLogo = (d: DocumentData): DocumentData =>
  logo ? { ...d, tenant: { ...d.tenant, logoFileId: "logo" } } : d;

const people: DocumentData[] = [
  SAMPLE_REGISTRATION,
  {
    ...SAMPLE_REGISTRATION,
    person: {
      firstName: "Maria Eduarda",
      lastName: "de Albuquerque Figueiredo",
      badgeName: "Maria Eduarda Figueiredo",
      jobTitle: "Gerente de Relações Institucionais e Sustentabilidade",
    },
    organization: { name: "Cooperativa Agroindustrial dos Produtores do Oeste Paulista" },
    registration: {
      ...SAMPLE_REGISTRATION.registration,
      category: "Expositor",
      categoryColor: "#b45309",
      shortCode: "190377",
    },
  },
  {
    ...SAMPLE_REGISTRATION,
    person: { firstName: "José", lastName: "Ávila", badgeName: "José Ávila", jobTitle: "Repórter" },
    organization: { name: "Canal Rural" },
    registration: {
      ...SAMPLE_REGISTRATION.registration,
      category: "Imprensa",
      categoryColor: "#1e3a8a",
      shortCode: "771204",
    },
  },
];

async function main() {
  const label = await renderPdf(LABEL_80X40, people.map(withLogo), { loadAsset });
  writeFileSync(path.join(out, "etiqueta-80x40.pdf"), label.bytes);

  const badge = await renderPdf(BADGE_A6, people.map(withLogo), { loadAsset });
  writeFileSync(path.join(out, "cracha-a6.pdf"), badge.bytes);
  const badgeGuides = await renderPdf(BADGE_A6, [withLogo(people[1] ?? SAMPLE_REGISTRATION)], {
    loadAsset,
    guides: true,
  });
  writeFileSync(path.join(out, "cracha-a6-guias.pdf"), badgeGuides.bytes);

  const voucher = await renderPdf(VOUCHER_A4, [withLogo(SAMPLE_TRAVELER)], { loadAsset });
  writeFileSync(path.join(out, "voucher-a4.pdf"), voucher.bytes);

  const html = renderThermalHtml(LABEL_80X40, people, { autoPrint: false });
  writeFileSync(path.join(out, "etiqueta-80x40.html"), html.html);
  writeFileSync(
    path.join(out, "calibracao-80x40.html"),
    renderCalibrationHtml(parseDefinition(LABEL_80X40).page),
  );

  for (const [name, r] of Object.entries({ label, badge, voucher })) {
    console.log(
      `${name}: ${r.pageCount} página(s) · ${r.fileName}${r.warnings.length ? ` · avisos: ${r.warnings.join(" | ")}` : ""}`,
    );
  }
  console.log(`Amostras em ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
