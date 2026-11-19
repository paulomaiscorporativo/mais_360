/**
 * Modelos-base: pontos de partida por finalidade. O organizador escolhe um,
 * ajusta o texto e salva — nada aqui é enviado sem revisão.
 * Marcação: **negrito**, linha em branco = parágrafo, {{campo}} = dado da pessoa.
 */

export type Starter = {
  id: string;
  purpose: string;
  name: string;
  description: string;
  emailSubject: string;
  emailBody: string;
  whatsappBody: string;
  includeActions: boolean;
};

export const STARTERS: Starter[] = [
  {
    id: "blank",
    purpose: "CUSTOM",
    name: "Mensagem livre",
    description: "Comece do zero, com os campos que quiser.",
    emailSubject: "",
    emailBody: "",
    whatsappBody: "",
    includeActions: true,
  },
  {
    id: "rsvp",
    purpose: "REMINDER",
    name: "Pedido de confirmação",
    description: "Para quem ainda não confirmou presença.",
    emailSubject: "{{primeiro_nome}}, você vem ao {{projeto}}?",
    emailBody:
      "Olá, {{primeiro_nome}}!\n\nEstamos preparando cada detalhe do **{{projeto}}**, em {{data_inicio}}, às {{hora_inicio}}, no {{local}}.\n\nPara organizarmos tudo com o cuidado que você merece, pedimos que confirme sua presença — leva só alguns segundos.",
    whatsappBody:
      "Olá, {{primeiro_nome}}! 👋\n\nEstamos preparando o *{{projeto}}* — {{data_inicio}}, às {{hora_inicio}}, no {{local}}.\n\nPode confirmar sua presença por aqui? {{link_confirmar}}",
    includeActions: true,
  },
  {
    id: "d7",
    purpose: "REMINDER",
    name: "Lembrete 7 dias antes",
    description: "Data, local, traje e como chegar.",
    emailSubject: "Falta uma semana para o {{projeto}}",
    emailBody:
      "Olá, {{primeiro_nome}}!\n\nFaltam **{{dias_restantes}} dias** para o {{projeto}}. Separamos o essencial:\n\n**Quando:** {{data_inicio}}, às {{hora_inicio}}\n**Onde:** {{local}} — {{endereco}}\n**Traje:** {{traje}}\n\nNa recepção, basta apresentar o QR code do seu convite digital. Até lá!",
    whatsappBody:
      "Olá, {{primeiro_nome}}! Falta *uma semana* para o *{{projeto}}*.\n\n📅 {{data_inicio}}, às {{hora_inicio}}\n📍 {{local}} — {{link_mapa}}\n👔 {{traje}}\n\nSeu convite com QR code: {{link_cracha}}",
    includeActions: true,
  },
  {
    id: "confirmed",
    purpose: "REGISTRATION_CONFIRMED",
    name: "Inscrição confirmada",
    description: "Crachá digital e código de acesso.",
    emailSubject: "Inscrição confirmada — {{projeto}}",
    emailBody:
      "Olá, {{primeiro_nome}}!\n\nSua inscrição no **{{projeto}}** está confirmada.\n\nSeu código de acesso é **{{codigo}}**. Guarde também o seu crachá digital: no dia, ele agiliza a entrada pelo totem ou pelo balcão.",
    whatsappBody:
      "Tudo certo, {{primeiro_nome}}! Sua inscrição no *{{projeto}}* está confirmada. ✅\n\nCódigo de acesso: *{{codigo}}*\nCrachá digital: {{link_cracha}}",
    includeActions: true,
  },
  {
    id: "welcome",
    purpose: "CHECKIN_WELCOME",
    name: "Boas-vindas no check-in",
    description: "Sai assim que a pessoa é credenciada.",
    emailSubject: "Bem-vindo(a) ao {{projeto}}",
    emailBody:
      "Que bom ter você aqui, {{primeiro_nome}}!\n\nSeu credenciamento no {{projeto}} foi concluído. Aproveite a programação — qualquer necessidade, procure a nossa equipe.",
    whatsappBody:
      "Que bom ter você aqui, {{primeiro_nome}}! Seu credenciamento no *{{projeto}}* foi concluído. Aproveite! 🙌",
    includeActions: false,
  },
  {
    id: "survey",
    purpose: "SURVEY",
    name: "Agradecimento e pesquisa",
    description: "Pós-evento: agradeça e peça a opinião.",
    emailSubject: "Obrigado por participar do {{projeto}}",
    emailBody:
      "Olá, {{primeiro_nome}}!\n\nObrigado por estar com a gente no **{{projeto}}**. Sua opinião ajuda a deixar a próxima edição ainda melhor — são só dois minutos.",
    whatsappBody:
      "Olá, {{primeiro_nome}}! Obrigado por participar do *{{projeto}}*. Pode nos contar como foi? Leva só dois minutos.",
    includeActions: false,
  },
];
