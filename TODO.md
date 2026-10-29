# TODO — Cotações dos Indicadores

## Base de dados e API

- [ ] Tabelas de indicadores, solicitações de cotação, eventos da trilha e catálogo de opcionais criadas e migradas, com token público único por cotação e status `pendente`, `processando`, `concluida`, `falha` ou `cancelada`.
- [ ] API de cotação: criar pedido com placa, tipo de veículo, marca, modelo, ano, dados do cliente, estado, cidade, origem e opcionais; listar as próprias cotações; ver detalhe com trilha de eventos.
- [ ] API do responsável: listar todas as solicitações com filtro por status, ver qualquer cotação, cancelar um pedido pendente e pausar ou retomar a automação.
- [ ] Login Manus OAuth com sessão em cookie `SameSite=None; Secure`; primeiro usuário vira administrador com registro de auditoria; indicador convidado por e-mail é vinculado ao entrar com o mesmo e-mail.

## Formulário do indicador

- [ ] Formulário em etapas que aceita placa e dados do cliente, valida campos obrigatórios antes de enviar e grava a solicitação como `pendente`.
- [ ] Tipo de veículo selecionável, sem qualquer escolha de plano: a tela informa que o plano é definido automaticamente pelo sistema.
- [ ] Opcionais apresentados apenas quando existem e elegíveis para o plano; a seleção é registrada no pedido.

## Fila e automação

- [ ] Worker com trava no banco processa um pedido por vez, registra início e fim, impede processamento duplicado e devolve à fila pedidos travados por tempo limite.
- [ ] Adaptador de automação com executor simulado como padrão e executor Playwright documentado, sem enviar nada ao cliente automaticamente.
- [ ] Falha de processamento grava o motivo no pedido e na trilha, mantém o pedido visível para o responsável e não apaga dados do indicador.

## Acompanhamento e resultado

- [ ] Lista de cotações do indicador com estado legível, identificação do veículo pela placa e acesso ao detalhe.
- [ ] Detalhe da cotação com trilha de eventos, dados enviados, plano e valor quando disponíveis, motivo da falha quando houver, e atualização automática do estado.
- [ ] Cotação concluída oferece link público com token, compartilhamento por WhatsApp e uma versão de impressão em A4 pronta para salvar em PDF.
- [ ] Link público exibe a cotação em modo somente leitura, sem dados internos do indicador e sem exigir login.

## Painel do responsável

- [ ] Painel com todas as solicitações, contadores por estado, filtros e detalhe lado a lado no desktop.
- [ ] Alerta ao responsável a cada cotação concluída ou com falha, com indicador, placa e resultado; falha de alerta fica registrada e não derruba o pedido.
- [ ] Controle de pausa da automação, visível para o responsável e refletido no estado dos pedidos.
- [ ] Cadastro de indicadores por e-mail e ativação ou desativação de acesso.

## PWA instalável

- [ ] Manifesto com nome, ícones 192 e 512, cor de tema, `display: standalone` e `start_url`, servido com o link declarado na página.
- [ ] Service worker com cache do app shell, tela de indisponibilidade quando offline e atualização sem quebrar a sessão.
- [ ] Layout mobile-first instalável, com navegação inferior e área segura respeitada em iPhone.
- [ ] Rotas declaradas em `/manus-routes.json` coerentes com o App.

## Verificação final

- [ ] `pnpm check` sem erros de tipo e build de produção concluído.
- [ ] Fluxo de ponta a ponta validado no executor simulado: criar, enfileirar, processar, concluir, abrir detalhe, gerar impressão e abrir link público.
