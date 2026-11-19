/**
 * Endereços dos portais antigos (ABIEC/ABRADILAN) → rotas da plataforma.
 *
 * Os QR codes impressos e os links já enviados apontam para o domínio do
 * cliente (abiec.mais.tur.br/convite/<token>). A migração preserva os tokens;
 * aqui só o caminho muda. Usado pelo proxy, que responde com 308.
 */

const RULES: readonly [RegExp, (m: RegExpExecArray) => string][] = [
  // Convite digital com QR (token preservado em Registration.token)
  [/^\/convite\/([A-Za-z0-9_-]{8,128})\/?$/, (m) => `/c/${m[1]}`],
  // Formulário público de inscrição (formToken preservado em Project.publicToken)
  [/^\/f\/([A-Za-z0-9_-]{4,128})\/?$/, (m) => `/i/${m[1]}`],
  // Portal do passageiro (login por CPF + PIN) → portal do viajante (link pessoal)
  [/^\/portal(\/.*)?$/, () => "/v"],
  // Área da empresa convidante
  [/^\/empresa\/login\/?$/, () => "/empresa"],
];

/** Caminho novo para um caminho antigo, ou null se não for endereço do legado. */
export function legacyRedirect(pathname: string): string | null {
  for (const [re, to] of RULES) {
    const m = re.exec(pathname);
    if (m) return to(m);
  }
  return null;
}
