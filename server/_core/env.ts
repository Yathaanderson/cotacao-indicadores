// Configuração lida do ambiente no momento do uso. Nada aqui depende de serviço externo.
export const ENV = {
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  /** Chave de assinatura das sessões de login. Obrigatória em produção. */
  get sessionSecret() { return process.env.JWT_SECRET ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
};
