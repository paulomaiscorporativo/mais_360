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

## Criar usuários de cada nível

Ninguém recebe mais senha provisória na tela: a pessoa recebe um **convite por e-mail** e cria a
própria senha em `/entrar/convite/<token>` (vale 7 dias, uso único). O link também aparece na tela
de quem convidou, para copiar se o e-mail não chegar. Para os e-mails saírem, o worker precisa
estar rodando (`npm run dev:worker`); em desenvolvimento eles caem no Mailpit
(http://localhost:8025).

| Nível                          | Onde convidar                                                        | Quem pode                        |
| ------------------------------ | -------------------------------------------------------------------- | -------------------------------- |
| Superadmin / Suporte           | **Plataforma › Equipe da plataforma** (`/console/plataforma/equipe`) | Superadmin                       |
| Dono de um novo assinante      | **Plataforma › Assinantes › Novo assinante** (responsável)           | Superadmin                       |
| Dono, admin, operador, financ. | **Assinante › Equipe** (`/console/<assinante>/equipe`)               | Dono e admin (só dono cria dono) |
| Admin de um novo cliente       | **Novo cliente** (passo "Administrador")                             | Dono e admin do assinante        |
| Papéis do cliente              | **Cliente › Equipe** (`…/clientes/<cliente>/equipe`)                 | Admin do cliente (e acima)       |

- Quem **já tem conta** ganha só o novo acesso (sem convite de senha) e recebe um aviso por e-mail.
- Em cada equipe, o menu da pessoa permite reenviar o convite, enviar link de redefinição de
  senha (1 hora), desativar/reativar e remover. Desativar derruba as sessões na hora; só
  desativa a conta inteira quem administra **todos** os acessos da pessoa — senão, remove apenas
  o acesso daquele cliente/assinante.
- **Acesso por projeto** (equipe do cliente › "Acesso por projeto"): todos os projetos ou só
  alguns, com papel opcional por projeto (ex.: leitor de acesso só na Plenária).
- Esqueceu a senha: link **Esqueci a senha** no login (`/entrar/esqueci`).

Os papéis de balcão, leitor e vendas ganham telas próprias na Fase 2 (credenciamento, feiras).
O aprovador já decide em **Viagens corporativas › Aprovações**. Perfis externos com área própria:
associado (abaixo), empresa com cota de convites e viajante (projetos demo).

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

## Viagens corporativas (ABIEC)

O mesmo `npm run db:seed:demo` recria (sem mexer em outras solicitações do cliente):

- **Política geral ABIEC**: econômica, aéreo até R$ 4.500 por trecho, hotel até R$ 1.200 por noite
  e 4 estrelas, 10 dias de antecedência, seguro obrigatório no exterior.
- **Diretoria ABIEC** (tipo de membro `DIRETOR`, prioridade 10): executiva, limites maiores.
- **Aprovação só fora da política**, decidida pelo papel aprovador (`aprovador.abiec@demo.test`).
- Seis solicitações: nova, em atendimento, cotada com duas opções (uma fora da política),
  **fora da política aguardando aprovação** (SIAL Paris, com justificativa), reservada com
  localizadores (diretoria) e cancelada.

| Área do associado — `/t/abiec/viagens` | E-mail                      | Deve conseguir                                                 |
| -------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| Associado                              | `associado.abiec@demo.test` | Pedir viagens, escolher entre as opções da Gulfood, acompanhar |
| Diretora (política da diretoria)       | `diretora.abiec@demo.test`  | Ver a viagem reservada com localizadores                       |

Mesma senha dos usuários demo. No console: **ABIEC › Viagens corporativas** (fila, aprovações,
política e acessos — onde a equipe gera senhas provisórias para outros associados).
