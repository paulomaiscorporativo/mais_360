# @mais/documents — motor de documentos

Um único motor para **vouchers, crachás, etiquetas, certificados e listas**. Unifica o voucher da
ABIEC (seções automáticas e PDF de fundo com campos posicionados) e a etiqueta térmica do
credenciamento (layout em mm), e acrescenta o crachá completo com sangria e furos.

```
@mais/core/documents   modelo (zod), campos, ajuste de texto, cores, CODE128, modelos padrão — puro
@mais/documents        prepare → lista de exibição em mm → renderPdf | renderThermalHtml
packages/db            DocumentTemplate (definição Json + versão) e DocumentRender (log de emissão)
```

## Uso

```ts
import { BADGE_A6, type DocumentData } from "@mais/core";
import { renderPdf, renderThermalHtml } from "@mais/documents";

// PDF (crachá, voucher, lote): uma página por registro (+ continuação das seções)
const { bytes, pageCount, fileName, warnings } = await renderPdf(template.definition, records, {
  loadAsset: async (fileId) => storage.read(fileId), // logos, fotos, PDF de fundo
});

// Térmica (balcão/totem com Chrome --kiosk-printing): HTML com @page no tamanho exato
const { html } = renderThermalHtml(template.definition, [record], {
  assetUrl: (id) => `/api/files/${id}`,
  autoPrint: true,
});
```

`DocumentData` é montado pelo servidor a partir de inscrição, pessoa, projeto, cliente, voos e
hospedagem — o motor não conhece o Prisma.

## Garantias

- **UTF-8 completo** (fontes TTF embutidas e subconjuntadas): acabou o "?" no lugar de acento/seta.
- **Ajuste automático** com as métricas reais da fonte; abaixo do tamanho mínimo, trunca com "…"
  e devolve aviso — nunca vaza da etiqueta.
- **Mesma lista de exibição** para PDF e HTML: a pré-visualização bate com a térmica.
- **Datas no fuso do projeto**, nunca no do servidor.
- **Sangria, área de corte (TrimBox) e furos** no crachá; guias de conferência com `guides: true`.
- Fundo em PDF multipágina (página em branco tolerada) ou imagem; lote em um único PDF.

## Amostras

```bash
SAMPLE_LOGO=/caminho/logo-branco.png npm run samples -w @mais/documents
```

Gera `samples/` (não versionado): etiqueta 80×40, crachá A6 (com e sem guias), voucher A4 e HTML
térmico + calibração.

## Empacotamento

As fontes ficam em `fonts/` (OFL). Em ambientes que movem o código (bundle do Next.js), defina
`DOCUMENTS_FONTS_DIR` ou inclua a pasta nos arquivos rastreados do servidor.
