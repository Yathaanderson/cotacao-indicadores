export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Tela de login por e-mail e senha. Navegação simples, sem efeitos colaterais.
export const goToLogin = () => {
  if (window.location.pathname !== "/entrar") window.location.href = "/entrar";
};
