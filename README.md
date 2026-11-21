# Cotações dos Indicadores

PWA para indicadores solicitarem cotações de seguro auto. Roda de forma independente, sem serviços da Manus: React + Vite no cliente, Express + tRPC + Drizzle (MySQL) no servidor, login próprio, alertas por e-mail via SMTP e deploy com Docker.

## Desenvolvimento local

Requisitos: Node 22, pnpm 10.18.0 e um MySQL acessível em `DATABASE_URL`.

```bash
pnpm install
cp .env.example .env   # ajuste DATABASE_URL, JWT_SECRET, ADMIN_EMAIL e ADMIN_PASSWORD
pnpm db:migrate
pnpm dev
```

Scripts úteis:

- `pnpm dev`: servidor de desenvolvimento com Vite.
- `pnpm build` / `pnpm start`: gera `dist/` e sobe a versão de produção.
- `pnpm db:migrate`: aplica as migrações versionadas em `drizzle/`.
- `pnpm check` / `pnpm test`: tipos e testes.

## Deploy na VPS (Docker)

A stack `docker-compose.yml` sobe a aplicação e um MySQL 8.4. O Caddy também está no arquivo, mas é opcional (profile `caddy`): quando ativado, ele emite o certificado HTTPS automaticamente.

### 1. Preparar a VPS

Instale Docker e o plugin Compose. Abra as portas 80 e 443 no firewall. Aponte o DNS do domínio (registro `A`) para o IP da VPS e espere a propagação.

Pare qualquer serviço que já use as portas 80 e 443 (nginx, Apache ou o nginx do CloudPanel). O Caddy precisa delas para emitir o certificado. Se houver outros sites nesse servidor, use um proxy reverso do host apontando para `http://127.0.0.1:3000` em vez do Caddy.

### 2. Baixar o projeto e configurar

```bash
git clone <url-do-repositorio> cotacao-indicadores
cd cotacao-indicadores
cp .env.example .env
```

Edite o `.env` e preencha:

- `APP_DOMAIN`: o domínio público.
- `MYSQL_PASSWORD` e `MYSQL_ROOT_PASSWORD`: senhas fortes. Use apenas letras e números, para não precisar de escape na `DATABASE_URL`.
- `JWT_SECRET`: gere com `openssl rand -hex 48`. Obrigatório em produção; sem ele o servidor não sobe.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_NAME`: o responsável. A senha precisa ter pelo menos 8 caracteres.
- `SMTP_*`: servidor de e-mail para os alertas. Sem ele o app funciona, mas os alertas não são enviados e a falha fica registrada no log.
- `AUTOMATION_DRIVER`: mantenha `simulado` até o acesso ao PowerCRM ser liberado.
- `N8N_WEBHOOK_URL`: opcional. URL do webhook do n8n para os alertas em tempo real (ver abaixo). Vazio = desligado.

### 3. Subir

```bash
docker compose --profile caddy up -d --build
docker compose logs -f app
```

O app sobe em `127.0.0.1:3000`, sem exposição pública. Sem `--profile caddy`, só o app e o banco sobem, e o domínio não é atendido. Se o servidor usar um proxy próprio (sem Caddy), rode `docker compose up -d --build` e aponte o proxy para `http://127.0.0.1:3000`.

Na primeira execução, a aplicação aplica as migrações, cria o responsável e inicia a fila de automação. Acesse `https://<APP_DOMAIN>/entrar` e entre com `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

### Alertas no WhatsApp (opcional, via n8n)

Com `N8N_WEBHOOK_URL` preenchido, o app envia eventos em JSON ao n8n em três momentos:

- `nova_cotacao`: um indicador pediu uma cotação.
- `cotacao_concluida`: a automação terminou com sucesso.
- `cotacao_falha`: a automação falhou.

Cada evento traz indicador, cliente, telefone do cliente, veículo, placa, cidade/UF, plano, mensalidade, número da cotação e motivo. O envio é feito em segundo plano e não atrasa a cotação: se o n8n estiver fora do ar, a falha só aparece no log da aplicação.

Para ligar o WhatsApp, o workflow no n8n precisa de:

1. Um nó **Webhook** (método `POST`, path `cotacoes`, resposta "On Received"), com o workflow **ativo**. O webhook de produção só responde com o workflow ativo.
2. Um nó **HTTP Request** com `POST https://<seu-evolution-go>/send/text`, corpo JSON `{"number": "<DDI+DDD+número>", "text": "<mensagem>"}` e o header `apikey` com o **token da instância** do Evolution Go (não a chave global).

Depois, defina no `.env` `N8N_WEBHOOK_URL=https://<seu-n8n>/webhook/cotacoes` e reinicie a aplicação. Sempre que alterar o workflow, clique em **Publish**: o n8n executa a versão publicada, não o rascunho.

### Cotação pelo WhatsApp (conversa guiada)

O indicador pode pedir cotação pelo WhatsApp. O número dele precisa estar cadastrado no campo *celular* do indicador. A conversa segue as perguntas: tipo do veículo, placa, nome, celular e e-mail do cliente, UF, cidade e observações. No fim, o indicador responde *SIM* para enviar ou *NAO* para cancelar. Em qualquer momento, *CANCELAR* volta ao início.

Quando a cotação termina, o aplicativo manda ao n8n o texto final (plano, mensalidade e link) e o n8n o envia ao indicador.

Peças:

- `server/whatsapp/`: regras da conversa (`fluxo.ts`), criação do pedido (`pedido.ts`) e o endpoint `POST /api/whatsapp/mensagem`, protegido pelo token `WHATSAPP_BRIDGE_TOKEN`.
- `n8n/whatsapp-entrada.json`: recebe as mensagens do Evolution Go e devolve a resposta do app.
- `n8n/cotacao-alerta-whatsapp.json`: avisos ao responsável e, quando o pedido veio do WhatsApp, o resultado ao indicador.

Para ligar:

1. Gere um token para o n8n e coloque em `WHATSAPP_BRIDGE_TOKEN` no `.env`: `openssl rand -hex 32`. Depois, reinicie o app.
2. No n8n, importe os dois arquivos de `n8n/`. Substitua `COLE_AQUI_O_WHATSAPP_BRIDGE_TOKEN` pelo token do passo 1, `COLE_AQUI_O_TOKEN_DA_INSTANCIA` pelo token da instância do Evolution Go e `SEU_NUMERO_COM_DDI` pelo seu número, no alerta. Ative os dois.
3. No Evolution Go, a instância precisa enviar as mensagens recebidas ao webhook do n8n. Isso é configurado no banco `evogo_users`, na tabela `instances` (campos `webhook` e `events`), com o valor `MESSAGE` em `events`. Depois, reinicie o `evolution-go`.

### Serviços fora deste repositório

Na VPS de produção, o proxy e os serviços auxiliares ficam em stacks separadas, fora do repositório:

- **Caddy único no host** (`network_mode: host`, portas 80 e 443), com um bloco por domínio: a aplicação (`127.0.0.1:3000`), o n8n (`127.0.0.1:5678`) e o Evolution Go (`127.0.0.1:4000`). O `network_mode: host` é necessário porque os serviços publicam apenas em `127.0.0.1`, que um container não alcança pelo gateway do Docker.
- **n8n** com Postgres, e **Evolution Go** com Postgres, ambos publicados só em `127.0.0.1`.

Nesse servidor, o Caddy do repositório fica parado, porque o proxy único já usa as portas 80 e 443. Suba a aplicação com `docker compose up -d --build` (sem `--profile caddy`) e aponte o bloco do domínio no proxy do host.

### Operação

- Atualizar: `git pull && docker compose --profile caddy up -d --build`.
- Backup do banco: `docker compose exec db sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" cotacao' > backup-$(date +%F).sql`.
- Trocar a senha do responsável: como o `.env` não troca uma senha já cadastrada, é preciso limpar o hash no banco (`UPDATE users SET passwordHash = NULL WHERE email = '...'`) e reiniciar a aplicação com a nova `ADMIN_PASSWORD`.

## Estrutura

- `client/`: aplicação React (PWA).
- `server/`: API tRPC, autenticação, fila de automação e alertas.
- `server/automation/`: worker da fila e executores (`simulado` e `powercrm`).
- `drizzle/`: schema e migrações.
- `Dockerfile`, `docker-compose.yml`, `Caddyfile`: empacotamento para a VPS.

Detalhes de produto e arquitetura estão em [plan.md](plan.md) e a lista de entregas em [TODO.md](TODO.md).
