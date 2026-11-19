# Usuários de demonstração

Criados por `npm run db:seed:demo` (depois de `npm run db:seed`). Nunca rodam em produção.
Senha de todos: **`Demo@2026!`** (ou `DEMO_PASSWORD` do `.env`). Entram direto, sem troca de senha.
O domínio `.test` é reservado e não recebe e-mail.

| Nível                    | E-mail                                 | Deve conseguir                                                           |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------------ |
| Superadmin da plataforma | `master@mais.tur.br` (senha do `.env`) | Tudo: assinantes, planos, todos os clientes                              |
| Suporte da plataforma    | `suporte@demo.test`                    | Acesso assistido aos assinantes                                          |
| Admin do assinante       | `admin.assinante@demo.test`            | Criar clientes, liberar módulos, gerenciar equipe da Mais Corporativo    |
| Operador do assinante    | `operador.assinante@demo.test`         | Operar só a ABIEC                                                        |
| Financeiro do assinante  | `financeiro.assinante@demo.test`       | Área financeira do assinante                                             |
| Admin do cliente         | `admin.abiec@demo.test`                | Administrar a ABIEC (marca, termos, equipe)                              |
| Gestor                   | `gestor.abiec@demo.test`               | Criar e operar projetos da ABIEC                                         |
| Aprovador                | `aprovador.abiec@demo.test`            | Aprovar viagens da ABIEC                                                 |
| Operador                 | `operador.abiec@demo.test`             | Operar projetos atribuídos                                               |
| Balcão                   | `balcao.abiec@demo.test`               | Credenciamento no balcão                                                 |
| Leitor de acesso         | `leitor.abiec@demo.test`               | Ler QR na entrada de áreas                                               |
| Vendas de stands         | `vendas.abiec@demo.test`               | Reservar stands                                                          |
| Visualizador             | `visualizador.abiec@demo.test`         | Só leitura                                                               |
| Admin de outro cliente   | `admin.abradilan@demo.test`            | Só a ABRADILAN — **não** pode ver a ABIEC                                |
| Dono de outro assinante  | `dono.outraagencia@demo.test`          | Só a "Outra Agência" e seu cliente — **não** vê nada da Mais Corporativo |

Os papéis de balcão, leitor, aprovador e vendas ganham telas próprias na Fase 2 (credenciamento,
viagens corporativas, feiras). Perfis externos — associado, empresa com cota de convites,
participante e viajante — entram quando as áreas deles forem construídas.

## Projetos de demonstração (ABIEC)

O mesmo `npm run db:seed:demo` recria dois projetos com dados, para testar as telas da Onda 2.
Rodar de novo apaga e recria os dois; os links públicos mudam a cada execução e aparecem no
final da saída do comando (também ficam na ficha de cada inscrição no console).

**Incentivo Lisboa 2027** (viagem de grupo, fuso de Lisboa)

- 8 viajantes em dois grupos (Diretoria e Associados), voos TP82/TP81 com dois localizadores e
  assentos, hotel com rooming (diretoria em single, associados em twin; um quarto ainda sem
  número), roteiro de 8 itens com público por grupo, checklist com itens atrasados, mural e
  dois chamados de suporte.
- Pendências de propósito: Eduardo Sampaio tem passaporte vencendo em menos de 6 meses depois da
  volta; Fábio Nogueira está sem passaporte e sem quarto.
- Portal do viajante: `/t/abiec/v/<token>`.

**Jantar Anual ABIEC 2026** (evento com convites, 10/12/2026 às 20h)

- 4 empresas com cota, 12 convites (confirmados, pendentes e um recusado; dois individuais),
  categorias Autoridade e Associado, mesa de honra e 6 mesas redondas com os confirmados
  acomodados. O envio automático está desligado para nada sair por e-mail.
- Convite e credencial: `/t/abiec/c/<token>`.
- Portal da empresa: `/t/abiec/empresa`, com os logins `aurora-do-cerrado`, `vale-verde`,
  `pampa-alimentos` e `serra-azul` e a mesma senha dos usuários demo.
