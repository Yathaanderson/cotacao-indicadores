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

A stack `docker-compose.yml` sobe três serviços: a aplicação, um MySQL 8.4 e o Caddy, que emite o certificado HTTPS automaticamente.

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

### 3. Subir

```bash
docker compose --profile caddy up -d --build
docker compose logs -f app
```

O app sobe em `127.0.0.1:3000`, sem exposição pública. Sem `--profile caddy`, só o app e o banco sobem, e o domínio não é atendido. Se o servidor usar um proxy próprio (sem Caddy), rode `docker compose up -d --build` e aponte o proxy para `http://127.0.0.1:3000`.

Na primeira execução, a aplicação aplica as migrações, cria o responsável e inicia a fila de automação. Acesse `https://<APP_DOMAIN>/entrar` e entre com `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

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
