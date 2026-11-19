# Contrato do módulo de documentos

Como balcão, totem, vouchers e portal do viajante geram documentos. O motor fica
em `@mais/core` (modelo, campos, layout) e `@mais/documents` (PDF e HTML
térmico); a aplicação web expõe o serviço em `apps/web/src/server/documents.ts`.

## Regra de ouro

Nenhum módulo desenha documento por conta própria. Todos chamam
`renderForRegistrations`, que monta os dados, gera o arquivo e registra a emissão
em `DocumentRender`.

## `renderForRegistrations(templateId, registrationIds, opts)`

```ts
import { renderForRegistrations } from "@/server/documents";

const out = await renderForRegistrations(template.id, [registration.id], {
  tenantId: ctx.tenantId,
  format: "thermal", // "pdf" | "thermal" — padrão: o `output` do modelo
  purpose: "PRINT", // PRINT | EMAIL | DOWNLOAD | PREVIEW — padrão PRINT
  actor: { type: "KIOSK", label: "Totem 3", kioskId: kiosk.id },
  autoPrint: true, // HTML térmico chama window.print() ao carregar
});

if (out.format === "thermal")
  return new Response(out.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
return new Response(Buffer.from(out.bytes), { headers: { "Content-Type": "application/pdf" } });
```

| Garantia | Detalhe                                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escopo   | Todas as inscrições precisam ser do `tenantId`; se alguma não for, lança `NOT_FOUND`.                                                                                         |
| Lote     | Até 1.000 inscrições viram **um** arquivo (uma página por etiqueta/crachá).                                                                                                   |
| Registro | Cria um `DocumentRender` com versão do modelo, páginas, inscrições e autor.                                                                                                   |
| Contagem | **Não** altera `Registration.printCount`/`lastPrintAt` — quem imprime decide (o balcão incrementa depois de confirmar a impressão; a reimpressão no totem exige confirmação). |
| Imagens  | No HTML térmico, logos e fotos vão embutidos (data URL): a etiqueta não depende da rede.                                                                                      |
| Fontes   | Embutidas (OFL). Acentos e símbolos saem corretos no PDF e na térmica.                                                                                                        |

**Ordem e mesas:** o arquivo sai na ordem dos `registrationIds` recebidos — quem chama
ordena antes com `@mais/core/sorting` (ver CONTRATO-PROJETOS, seção 6.1). Com
`hideSeats: true` (projeto sem `TABLES`), mesa e cadeira saem em branco. Lote pela
tela: `projetos/[project]/inscricoes/documentos` (crachás, etiquetas, relatório de QR).

## Qual modelo usar

O modelo padrão do tipo é o que o balcão e o totem imprimem:

```ts
const tpl = await prisma.documentTemplate.findFirst({
  where: {
    tenantId,
    kind: "LABEL",
    isDefault: true,
    archivedAt: null,
    OR: [{ projectId }, { projectId: null }],
  },
  orderBy: { projectId: "desc" }, // o do projeto vence o do cliente
});
```

O projeto escolhe o modo de impressão (`KioskDevice.printMode`): etiqueta → `LABEL`,
crachá completo → `BADGE`.

## Dados disponíveis

`registrationData(tenantId, ids)` monta o `DocumentData` de cada inscrição:
pessoa, empresa principal, categoria (com cor), grupo, papel, código curto, link do
QR (`APP_URL/c/<token>`), mesa e cadeira, voos com localizador, hospedagem com
quarto e o roteiro do projeto. Campos livres do cliente entram como `custom.<chave>`.
O catálogo de campos do editor está em `FIELD_CATALOG` (`@mais/core`).

## Rotas HTTP

| Rota                                                                                          | Uso                                                                                                 |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /api/documents/:templateId/render?format=pdf\|thermal&registration=&guides=1&download=1` | Modelo salvo, com dados de exemplo ou de uma inscrição (registra como `PREVIEW`).                   |
| `POST /api/documents/preview`                                                                 | HTML de uma página para o editor (modelo ainda não salvo).                                          |
| `POST /api/documents/assets` · `GET /api/documents/assets/:id`                                | Envio e leitura de arte de fundo/imagens (PDF, PNG, JPG até 15 MB), sempre checando o cliente dono. |
| `GET /api/documents/calibration?tenant=&page=`                                                | Página de calibração da impressora térmica.                                                         |
| `GET /api/documents/fonts/:file`                                                              | Fontes do motor para a pré-visualização.                                                            |

## Impressão térmica sem diálogo

No computador do balcão ou no totem, abra o Chrome em modo quiosque de impressão
apontando para a tela de operação:

```
chrome.exe --kiosk-printing https://<cliente>.mais.tur.br/...
```

O HTML térmico define `@page` no tamanho exato da etiqueta, aplica rotação e ajuste
fino do modelo e imprime sozinho com `autoPrint`. Use a página de calibração antes
do evento.

## Arquivos

O armazenamento atual (`storeFile`/`readStoredFile` em `server/documents.ts`) grava em
`STORAGE_DIR` e registra em `StoredFile`. Está isolado de propósito: quando a camada
geral de arquivos da plataforma existir, troque só essas duas funções.
