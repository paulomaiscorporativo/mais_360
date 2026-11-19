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
