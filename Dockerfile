FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN CI=1 pnpm install --frozen-lockfile
# Navegador usado pela automação do PowerCRM (driver playwright).
RUN pnpm exec playwright install --with-deps chromium
COPY . .
RUN pnpm build
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
# Aplica as migrações do banco antes de subir o servidor.
CMD ["sh", "-c", "pnpm db:migrate && node dist/index.js"]
