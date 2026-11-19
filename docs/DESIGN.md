# Design — linguagem visual e de interação

## Posicionamento

Um produto de operação que um cliente corporativo **quer** mostrar para o chefe.
Referências de rigor: Linear, Stripe Dashboard, Vercel, Ramp. Referência de
calor: hotelaria de alto padrão e papelaria de evento. Resultado: **precisão
calma** — denso onde se trabalha, generoso onde se recebe.

Duas personalidades, um sistema:

| Superfície                                                                            | Quem usa                       | Tom                                                      |
| ------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------- |
| **Console** (assinante, cliente, projeto)                                             | Equipe de operação             | Denso, rápido, teclado, tabelas, painéis laterais        |
| **Experiência** (convite, inscrição, área do participante, totem, portal do viajante) | Convidado, viajante, visitante | Editorial, generoso, marca do cliente em destaque, toque |

## Tipografia

- **Interface:** Instrument Sans (variável, 400–700). Números tabulares em tabelas e métricas.
- **Display editorial** (só na Experiência e em títulos de capa): Instrument Serif.
- **Códigos** (código curto, localizador, protocolo): Geist Mono.
- Escala: 12 · 13 · 14 (base do console) · 16 (base da Experiência) · 20 · 24 · 32 · 44 · 60.
- Títulos com `letter-spacing` levemente negativo; rótulos de seção em 12px, peso 600,
  caixa normal (nada de CAIXA ALTA espaçada em tudo).

## Cor

- **Neutros** com leve viés azul-tinta (derivados do azul Mais `#002042`), não cinza puro.
- **Marca do cliente** entra como `--brand` e só em pontos de ação e identidade: botão
  primário, item ativo, foco, cabeçalho da Experiência. Tons de hover, texto sobre a cor e
  contraste AA são **calculados** (`@mais/core/theme`) a partir do hex do cliente — qualquer
  cor que o cliente escolher funciona.
- **Semânticas** fixas e sóbrias: sucesso (verde-musgo), atenção (âmbar), erro (vermelho-tijolo),
  informação (azul). Sempre com ícone ou texto — nunca só cor.
- Modo escuro completo no console (operação noturna de evento).

## Forma e profundidade

- Raio: 6px (controles) · 10px (cartões, painéis) · 16px (folhas da Experiência).
- Bordas finas (1px, neutro 200) em vez de sombras pesadas; sombra só em camadas flutuantes
  (menu, popover, folha).
- Grade de 4px. Densidade do console: linhas de tabela de 40px; Experiência: alvos de toque ≥ 48px.

## Movimento

150–220ms, `ease-out` para entrar, `ease-in` para sair. Movimento explica mudança de estado
(painel desliza de onde veio, linha nova surge e assenta). Respeita `prefers-reduced-motion`.

## Padrões de interação

- **Command palette (⌘K / Ctrl+K)**: ir para qualquer cliente, projeto, pessoa ou ação.
- **Painel lateral (desktop) / folha inferior (mobile)** para criar e editar, sem perder o contexto
  da lista.
- **Tabelas** com cabeçalho fixo, filtros salvos, seleção em lote e ações em barra flutuante;
  no mobile viram lista de itens com a informação principal e ações por deslize/menu.
- **Edição inline** onde o dado é simples; salvar explícito onde há consequência (envio, cobrança).
- **Ações destrutivas** pedem confirmação com o nome do que será afetado e mostram desfazer quando
  possível.
- **Otimista** em alternâncias e reordenações; esqueleto (não spinner) no carregamento de páginas.
- **Estados vazios** ensinam o próximo passo com uma ação primária — nunca "Nenhum registro".
- **Erros** dizem o que aconteceu e o que fazer, em português claro.

## Navegação

- Desktop: barra lateral recolhível com seletor de assinante/cliente no topo, módulos ativos
  do cliente, e o projeto atual como segundo nível.
- Mobile (console): cabeçalho compacto + barra inferior com as 4 áreas mais usadas + "mais".
- Telas de operação (balcão, leitor, totem) são tela cheia, sem navegação do console.

## Proibido

Gradientes roxo-azulados genéricos · emojis como ícones · grades de cartões iguais sem hierarquia ·
ilustrações 3D genéricas · textos vazios ("Potencialize sua gestão") · sombras grandes e borradas ·
cantos muito arredondados em tudo · centralizar todo o conteúdo · placeholders "Lorem ipsum".

## Stack de interface

Tailwind CSS 4 (tokens em CSS variables) · primitivas acessíveis Radix · `cmdk` (palette) ·
`sonner` (avisos) · `vaul` (folha inferior) · TanStack Table · lucide-react (traço 1.5) ·
`next/font` com as fontes auto-hospedadas.
