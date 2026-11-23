# Domínios dos clientes

Como os clientes ganham endereço próprio e como o servidor emite os certificados (https).

## Como funciona

Todo cliente responde em dois tipos de endereço:

| Tipo              | Exemplo                        | Como nasce                                   |
| ----------------- | ------------------------------ | -------------------------------------------- |
| Subdomínio padrão | `abiec.mais.tur.br`            | automático, `<slug>.<ROOT_DOMAIN>`           |
| Domínio próprio   | `eventos.abiec.com.br`         | cadastrado na ficha do cliente, aba Domínios |
| Endereço legado   | `abradilanviagens.mais.tur.br` | migrado; QR codes antigos dependem dele      |

O **endereço principal** é o que entra nos links de convite, inscrição, credencial e portais.
Por padrão é o subdomínio; o administrador do assinante pode escolher um domínio próprio
**verificado** como principal.

### Ciclo de um domínio próprio

1. O administrador do assinante cadastra o domínio (aba **Domínios** do cliente). O sistema
   valida o endereço (sem IP, sem curinga, nada dentro do domínio da plataforma) e o guarda
   como **Aguardando DNS** (`PENDING`), com um token de verificação.
2. A tela mostra dois registros para criar no DNS do cliente:
   - `CNAME eventos.abiec.com.br → clientes.mais.tur.br` (faz o endereço chegar ao servidor);
   - `TXT _mais360.eventos.abiec.com.br → "mais360-verificacao=<token>"` (prova a posse).
3. O worker consulta o DNS (fila `domains.verify`): no cadastro, no botão **Verificar agora**
   e numa varredura a cada 5 minutos, por até 7 dias. Com os dois registros certos, o domínio
   fica **Ativo** (`VERIFIED`). Sem eles depois de 7 dias, **Com problema** (`FAILED`) — o
   botão "Verificar agora" continua disponível.
4. Domínios verificados são reconferidos uma vez por dia, **só pelo apontamento** (o TXT pode
   ser apagado). Se o apontamento sumir, o domínio vira `FAILED`, deixa de ser o principal e
   os links voltam ao subdomínio padrão. Falha temporária do DNS (timeout) não derruba nada.

Domínio raiz (`abiec.com.br`) costuma não aceitar CNAME: o cliente usa ALIAS/ANAME com o
mesmo valor, ou um registro A com o IP do servidor — a verificação aceita qualquer apontamento
que resolva para os mesmos endereços do alvo. Na Cloudflare, o registro precisa estar como
"somente DNS" (nuvem cinza): com o proxy ligado, o certificado não é emitido aqui.

### Onde cada regra mora

| O quê                                                 | Onde                                                    |
| ----------------------------------------------------- | ------------------------------------------------------- |
| Normalizar/validar hostname, registros, interpretação | `packages/core/src/domains`                             |
| Consulta ao DNS, varredura, auditoria do sistema      | `apps/worker/src/domains.ts`                            |
| Tela e ações (cadastrar, verificar, principal…)       | `clientes/[tenant]/(gestao)/dominios`                   |
| Roteamento por host                                   | `proxy.ts` + `server/tenant-resolve.ts` (só `VERIFIED`) |
| Links públicos                                        | `server/public-links.ts` (só principal `VERIFIED`)      |
| Pergunta do certificado                               | `GET /api/tls/ask`                                      |

## Variáveis de ambiente

| Variável               | Padrão                   | Para quê                                                      |
| ---------------------- | ------------------------ | ------------------------------------------------------------- |
| `ROOT_DOMAIN`          | `localhost`              | domínio dos subdomínios dos clientes                          |
| `CONSOLE_HOST`         | `360.<ROOT_DOMAIN>`      | host do console (nunca é cliente)                             |
| `CUSTOM_DOMAIN_TARGET` | `clientes.<ROOT_DOMAIN>` | alvo do CNAME dos domínios próprios                           |
| `DNS_SERVERS`          | resolvedor do sistema    | (worker) servidores DNS da verificação, ex. `1.1.1.1,8.8.8.8` |

## Passo a passo para o operador (produção)

1. **DNS da plataforma** (zona `mais.tur.br`):
   - `A 360.mais.tur.br → <IP do servidor>` (console);
   - `A *.mais.tur.br → <IP do servidor>` (subdomínios dos clientes);
   - `A clientes.mais.tur.br → <IP do servidor>` (alvo dos CNAME dos domínios próprios; o
     curinga já cobre, mas um registro explícito evita surpresas).
2. **Caddy** na frente do app (exemplo abaixo): certificado curinga `*.mais.tur.br` pelo desafio
   DNS (precisa do módulo do provedor de DNS, ex. `caddy-dns/cloudflare`) e **on-demand TLS**
   para os domínios próprios, perguntando ao app se pode emitir.
3. **Worker** rodando (`npm run start -w @mais/worker`): sem ele os domínios ficam pendentes.
4. Para um cliente novo com domínio próprio: o administrador do assinante cadastra na aba
   Domínios e envia as instruções da tela para a TI do cliente. Quando ficar **Ativo**, marca
   como principal se quiser que os links novos usem esse endereço.

### Exemplo de Caddyfile

```caddyfile
{
	email infra@maiscorporativo.tur.br
	# Antes de emitir um certificado sob demanda, o Caddy pergunta ao app.
	# Use o endereço interno (o host "localhost" não é tratado como cliente).
	on_demand_tls {
		ask http://127.0.0.1:3000/api/tls/ask
	}
}

# Console e subdomínios dos clientes: um certificado curinga via desafio DNS
360.mais.tur.br, *.mais.tur.br, mais.tur.br {
	tls {
		dns cloudflare {env.CLOUDFLARE_API_TOKEN}
	}
	# A pergunta do certificado é só para o Caddy
	@tlsask path /api/tls/ask
	respond @tlsask 404
	reverse_proxy 127.0.0.1:3000
}

# Domínios próprios dos clientes: certificado emitido no primeiro acesso,
# só se /api/tls/ask responder 200 (domínio verificado)
https:// {
	tls {
		on_demand
	}
	@tlsask path /api/tls/ask
	respond @tlsask 404
	reverse_proxy 127.0.0.1:3000
}
```

O `reverse_proxy` repassa o `Host` original; o `proxy.ts` do app resolve o cliente por ele.

### O que `/api/tls/ask` responde

`GET /api/tls/ask?domain=<host>` → **200** (pode emitir) ou **404** (não pode), sem corpo e
sem sessão:

- 200 para o host do console, o `ROOT_DOMAIN`, o host do `APP_URL` e o alvo do CNAME;
- 200 para `<slug>.<ROOT_DOMAIN>` de cliente **ativo** cujo assinante não está cancelado
  (ou endereço legado verificado);
- 200 para domínio próprio **verificado** (cliente não arquivado, assinante não cancelado);
- 404 para todo o resto: domínio pendente ou com problema, subdomínio reservado (`www`, `api`…),
  hosts inválidos. Isso impede que qualquer pessoa aponte um domínio para o servidor e esgote o
  limite de emissão de certificados.

Teste rápido: `curl -i "http://127.0.0.1:3000/api/tls/ask?domain=eventos.cliente.com.br"`.

## Assinante suspenso ou cancelado

Ver ADR 0004: com o assinante **suspenso**, domínios e páginas públicas continuam no ar (só o
console fica somente leitura). Com o assinante **cancelado**, as páginas públicas saem do ar e
`/api/tls/ask` deixa de autorizar novos certificados para os clientes dele.
