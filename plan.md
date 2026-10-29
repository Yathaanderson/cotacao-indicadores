# Plano — Cotações dos Indicadores (PWA)

## Objetivo

Um PWA instalável no celular do indicador para ele mesmo solicitar a cotação de seguro auto. O indicador informa placa e dados do cliente, o sistema enfileira o pedido, a automação preenche a cotação no PowerCRM pela interface web (Playwright, sem API) e devolve o resultado. O responsável (Yatha) recebe alerta a cada cotação e fiscaliza pelo painel, sem etapa de aprovação.

## Restrições conhecidas

- O PowerCRM não libera API para uso próprio. A integração é pela interface web, com o login do responsável.
- O plano é escolhido automaticamente pelo sistema conforme o tipo de veículo. O indicador não escolhe plano, apenas opcionais elegíveis.
- Ainda não temos o endereço do PowerCRM, os seletores reais da tela nem um ambiente de teste. A integração real fica atrás de um adaptador, com executor simulado como padrão.
- O sandbox é efêmero. A execução contínua do robô exige uma máquina persistente; o app foi desenhado para não depender de o navegador rodar no mesmo processo da interface.

## Arquitetura

**Frontend (React + Vite, mobile-first).** Quatro telas: início com a lista de cotações do indicador e um botão grande de nova cotação; formulário em etapas (veículo, cliente, opcionais, revisão); detalhe com a linha do tempo do pedido; painel do responsável com todas as solicitações, falhas e pausa da automação. Uma quinta tela, de impressão, gera a cotação em formato A4 para "salvar como PDF" pelo próprio celular. Link público com token permite o indicador repassar a cotação ao cliente.

**Backend (Express + tRPC + Drizzle/MySQL).** Guarda indicadores, solicitações, opcionais disponíveis e o histórico de eventos. Cada pedido tem uma máquina de estados explícita: `pendente → processando → concluida` ou `falha`, com `cancelada` como saída manual. Toda transição grava um evento, o que dá a trilha de auditoria que o responsável precisa.

**Fila.** O worker roda no servidor, pega um pedido `pendente` por vez com trava no banco (`UPDATE ... WHERE status = 'pendente' LIMIT 1`), e processa em contexto de navegador isolado. Se o processo cair, o pedido permanece em `processando` e volta para a fila por tempo limite. Duplicidade é impedida pelo token único e pela trava.

**Automação.** `server/automation/powercrm.ts` define a interface do executor: receber um pedido, devolver plano, valor, número da cotação, link de compartilhamento e PDF. Duas implementações: `SimulatedDriver` (padrão, gera resultado de demonstração sem tocar no PowerCRM) e `PowerCrmDriver` (Playwright, pronta para receber URL, seletores e sessão). O adaptador é escolhido por variável de ambiente. Nada é enviado ao cliente automaticamente.

**Alertas.** Cada cotação concluída ou com falha dispara notificação ao proprietário pelo serviço de notificações da plataforma. Falha de alerta não derruba o pedido: fica registrada no evento e o painel mostra o estado real.

**Autenticação.** Login Manus OAuth. O primeiro usuário a entrar vira administrador (bootstrap único, registrado em auditoria); os demais entram como indicadores. O administrador convida indicadores por e-mail; ao entrar com o mesmo e-mail, a conta é vinculada automaticamente. Sessão com cookie `SameSite=None; Secure` para funcionar no Preview embutido.

## Design

**Movimento:** utilitarismo editorial suíço — planilha de seguradora com precisão tipográfica, sem ornamento.

**Princípios:** densidade legível no celular; números e placas com tratamento mono; estado sempre visível antes da ação; nada de cor decorativa em área de decisão.

**Cor:** fundo marfim frio, tinta azul-petróleo para texto, azul-placa como cor de ação. Âmbar aparece só em alerta e pendência; verde só em concluído; vermelho só em falha. A cor nunca é o único sinal — sempre acompanha rótulo.

**Layout:** coluna única no celular com cartões de borda fina e uma faixa de status à esquerda do cartão, como um fichário. No desktop o painel do responsável vira duas colunas: lista à esquerda, detalhe à direita.

**Elementos assinatura:** a placa Mercosul estilizada como etiqueta; a trilha vertical de eventos com marcadores; o carimbo "PLANO DEFINIDO PELO SISTEMA" como selo textual, não ícone.

**Interação:** o formulário avança por etapas com retorno claro; ações destrutivas pedem confirmação; cada envio devolve uma resposta imediata e um estado persistente.

**Animação:** transições curtas de 150–200 ms, sem deslocamento exagerado; a linha do tempo revela novos eventos com fade; nada anima durante carregamento de dados.

**Tipografia:** Inter para interface, IBM Plex Mono para placa, valores e números de cotação. Hierarquia por peso e tamanho, não por caixas.

**Essência:** cotação de seguro auto sem depender do responsável — confiável, direta, operacional. Personalidade: precisa, sóbria, prestativa.

**Voz:** frases curtas em português do Brasil, sem jargão de marketing. Exemplos: "Sua cotação está na fila." / "Não deu para concluir. O responsável já foi avisado."

**Marca:** "Cotação" em caixa alta com tracking aberto e uma barra vertical à esquerda, como um selo de protocolo. Cor própria: azul-placa `#1B3FA0`.

## Estrutura do projeto

```
client/
  index.html                  metadados, manifest, fontes
  public/manifest.webmanifest manifesto do PWA
  public/sw.js                cache do app shell
  public/icons/               ícones 192/512
  src/App.tsx                 rotas
  src/pages/                  Inicio, NovaCotacao, CotacaoDetalhe, Painel, Imprimir, LinkPublico, Login
  src/components/             AppShell, CartaoCotacao, SeloStatus, TrilhaEventos, SeletorOpcionais
server/
  routers.ts                  procedures: quotes, admin, profile
  db.ts                       consultas por entidade
  automation/powercrm.ts      interface do executor, simulado e Playwright
  automation/worker.ts        laço da fila e trava de concorrência
  _core/index.ts              inicialização do worker
drizzle/schema.ts             tabelas
```

## Fora do escopo desta entrega

Integração real com o PowerCRM, armazenamento do PDF oficial em nuvem, cobrança e aplicativo nativo. O executor Playwright é entregue como esqueleto documentado, pronto para receber os seletores quando houver acesso de teste.
