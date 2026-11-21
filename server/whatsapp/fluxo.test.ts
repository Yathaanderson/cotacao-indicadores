import { describe, expect, it } from "vitest";
import { mesmoTelefoneWhatsapp, normalizarTelefoneWhatsapp } from "../db";
import { tokenValido } from "./rotas";
import {
  ESTADO_INICIAL,
  mensagemResultado,
  placaValida,
  processarMensagem,
  type EstadoConversa,
} from "./fluxo";

const ctx = { nomeIndicador: "Maria", pedidoId: null };

function conversar(mensagens: string[]) {
  let estado: EstadoConversa = ESTADO_INICIAL;
  let ultimo = null as ReturnType<typeof processarMensagem> | null;
  for (const texto of mensagens) {
    ultimo = processarMensagem(estado, texto, ctx);
    estado = ultimo.estado;
  }
  return { estado, ultimo: ultimo! };
}

describe("fluxo guiado do WhatsApp", () => {
  it("leva do COTAR até a confirmação com os dados validados", () => {
    const { estado, ultimo } = conversar([
      "cotar",
      "2",
      "abc-1d23",
      "João da Silva",
      "81 99999-1234",
      "pular",
      "pe",
      "Recife",
      "pular",
    ]);
    expect(estado.etapa).toBe("confirmar");
    expect(estado.dados.placa).toBe("ABC1D23");
    expect(estado.dados.tipo).toBe("carro-utilitario-grande");
    expect(estado.dados.uf).toBe("PE");
    expect(estado.dados.emailCliente).toBeNull();
    expect(ultimo.resposta).toContain("Responda *SIM*");
  });

  it("SIM gera o pedido com os dados completos", () => {
    const { estado } = conversar(["cotar", "moto", "ABC1234", "Ana Souza", "81999991234", "ana@x.com", "SP", "Campinas", "sem"]);
    const r = processarMensagem(estado, "sim", ctx);
    expect(r.criar).toEqual({
      tipo: "moto",
      placa: "ABC1234",
      nomeCliente: "Ana Souza",
      celularCliente: "81999991234",
      emailCliente: "ana@x.com",
      uf: "SP",
      cidade: "Campinas",
      observacoes: null,
    });
  });

  it("NAO cancela sem criar pedido", () => {
    const { estado } = conversar(["cotar", "1", "ABC1D23", "Ana Souza", "81999991234", "pular", "PE", "Recife", "pular"]);
    const r = processarMensagem(estado, "nao", ctx);
    expect(r.criar).toBeNull();
    expect(r.estado).toEqual(ESTADO_INICIAL);
  });

  it("recusa placa inválida e repete a pergunta", () => {
    const r = processarMensagem({ etapa: "placa", dados: { tipo: "moto" } }, "12345", ctx);
    expect(r.estado.etapa).toBe("placa");
    expect(r.resposta).toContain("placa não parece válida");
  });

  it("recusa UF inexistente", () => {
    const r = processarMensagem({ etapa: "uf", dados: {} }, "XX", ctx);
    expect(r.estado.etapa).toBe("uf");
  });

  it("CANCELAR a qualquer momento volta ao início", () => {
    const r = processarMensagem({ etapa: "nomeCliente", dados: { tipo: "moto" } }, "cancelar", ctx);
    expect(r.estado).toEqual(ESTADO_INICIAL);
  });

  it("enquanto a cotação está em andamento, não aceita novo pedido", () => {
    const r = processarMensagem({ etapa: "aguardando", dados: {} }, "cotar", { ...ctx, pedidoId: 42 });
    expect(r.criar).toBeNull();
    expect(r.resposta).toContain("#42");
    expect(r.estado.etapa).toBe("aguardando");
  });

  it("mensagem sem comando recebe o menu", () => {
    const r = processarMensagem(ESTADO_INICIAL, "oi", ctx);
    expect(r.resposta).toContain("COTAR");
  });
});

describe("validações e telefone", () => {
  it("aceita placa antiga e Mercosul", () => {
    expect(placaValida("ABC1234")).toBe(true);
    expect(placaValida("ABC1D23")).toBe(true);
    expect(placaValida("AB12345")).toBe(false);
  });

  it("compara telefone ignorando DDI e formatação", () => {
    expect(normalizarTelefoneWhatsapp("+55 (81) 99999-1234")).toBe("81999991234");
    expect(mesmoTelefoneWhatsapp("5581999991234", "(81) 99999-1234")).toBe(true);
    expect(mesmoTelefoneWhatsapp("5581999991234", "(81) 88888-1234")).toBe(false);
  });
});

describe("mensagem final ao indicador", () => {
  const base = {
    id: 1,
    status: "concluida",
    plate: "ABC1D23",
    planName: "Plano Ouro",
    monthlyPrice: "R$ 150,00",
    quoteNumber: "9988",
    shareUrl: "https://exemplo.test/c/1",
    errorMessage: null,
  };

  it("traz plano, mensalidade e link quando conclui", () => {
    const texto = mensagemResultado(base);
    expect(texto).toContain("Cotação pronta");
    expect(texto).toContain("R$ 150,00");
    expect(texto).toContain("https://exemplo.test/c/1");
  });

  it("explica a falha quando não conclui", () => {
    const texto = mensagemResultado({ ...base, status: "falha", errorMessage: "Placa não encontrada" });
    expect(texto).toContain("Não consegui concluir");
    expect(texto).toContain("Placa não encontrada");
  });
});

describe("token da ponte", () => {
  it("aceita só o token exato", () => {
    expect(tokenValido("segredo-123", "segredo-123")).toBe(true);
    expect(tokenValido("segredo-124", "segredo-123")).toBe(false);
    expect(tokenValido(undefined, "segredo-123")).toBe(false);
    expect(tokenValido("qualquer", undefined)).toBe(false);
  });
});
