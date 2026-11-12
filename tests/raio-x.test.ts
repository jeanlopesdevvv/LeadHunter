import { describe, expect, it } from "vitest";

import { analisarPagina, anoDoRodape, enderecoGratuito, enderecoPermitido, ipInterno, temViewport } from "@/lib/voob/raio-x-regras";
import { publicoDaBusca } from "@/lib/voob/regras";

const moderno = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Clínica</title></head>
<body><h1>Clínica Bem Estar</h1><p>Agende pelo WhatsApp.</p><footer>© 2026 Clínica Bem Estar</footer></body></html>`;
const antigo = `<html><head><title>Imobiliária</title></head><body><table><tr><td>Bem-vindo</td></tr></table>
<p>Copyright 2012-2017 Imobiliária Casa Mineira. Todos os direitos reservados.</p></body></html>`;

describe("Raio-X do site (12/11/2026)", () => {
  it("site atual, com celular e https: ok", () => {
    const r = analisarPagina({ html: moderno, status: 200, finalUrl: "https://clinica.com.br/", httpsFunciona: true, anoAtual: 2026 });
    expect(r).toMatchObject({ situacao: "ok", problemas: [], ano: 2026 });
  });
  it("sem viewport, sem https e rodapé de 2017: desatualizado, com os 3 motivos em português", () => {
    const r = analisarPagina({ html: antigo, status: 200, finalUrl: "http://casamineira.com.br/", httpsFunciona: false, anoAtual: 2026 });
    expect(r.situacao).toBe("desatualizado");
    expect(r.problemas.sort()).toEqual(["ano_antigo", "sem_celular", "sem_https"]);
    expect(r.textos).toContain("o rodapé do site ainda mostra 2017");
  });
  it("ano de 2 anos atrás ainda não conta como parado no tempo", () => {
    const r = analisarPagina({ html: moderno.replace("2026", "2024"), status: 200, finalUrl: "https://x.com.br", httpsFunciona: true, anoAtual: 2026 });
    expect(r.situacao).toBe("ok");
  });
  it("404 ou 410 na página inicial: o endereço não abre; erro passageiro (500, 503) ou página vazia: não conferido", () => {
    const base = { finalUrl: "https://x.com.br", httpsFunciona: false, anoAtual: 2026 };
    expect(analisarPagina({ ...base, html: "", status: 404 }).problemas).toEqual(["fora_do_ar"]);
    expect(analisarPagina({ ...base, html: "", status: 410 }).textos).toEqual(["o endereço do site que aparece no Google não está abrindo"]);
    for (const status of [500, 502, 503, 400, 406]) expect(analisarPagina({ ...base, html: "", status }).situacao).toBe("nao_conferido");
    expect(analisarPagina({ ...base, html: "   ", status: 200, httpsFunciona: true }).situacao).toBe("nao_conferido");
  });
  it("endereço gratuito (wixsite, blogspot...) conta; domínio próprio não", () => {
    expect(enderecoGratuito("https://clinicabemestar.wixsite.com/home")).toBe(true);
    expect(enderecoGratuito("https://sites.google.com/view/clinica")).toBe(true);
    expect(enderecoGratuito("https://www.clinicabemestar.com.br")).toBe(false);
    expect(enderecoGratuito("https://meuwixsite.com")).toBe(false);
    const r = analisarPagina({ html: moderno, status: 200, finalUrl: "https://clinica.wixsite.com/site", httpsFunciona: true, anoAtual: 2026 });
    expect(r.textos).toEqual(["o site usa um endereço gratuito, sem o domínio da empresa"]);
  });
  it("a ordem dos problemas é a da gravidade (o primeiro vai na frente na mensagem)", () => {
    const r = analisarPagina({ html: antigo, status: 200, finalUrl: "http://casamineira.blogspot.com/", httpsFunciona: false, anoAtual: 2026 });
    expect(r.problemas).toEqual(["sem_https", "sem_celular", "endereco_gratuito", "ano_antigo"]);
  });
  it("em construção e domínio à venda (só em página curta)", () => {
    const html = `<html><head><meta name="viewport" content="width=device-width"></head><body><h1>Site em construção</h1></body></html>`;
    expect(analisarPagina({ html, status: 200, finalUrl: "https://x.com.br", httpsFunciona: true, anoAtual: 2026 }).problemas).toEqual(["em_construcao"]);
    const longa = moderno.replace("<p>", `<p>${"Texto do site. ".repeat(400)} Nosso novo espaço está em construção.`);
    expect(analisarPagina({ html: longa, status: 200, finalUrl: "https://x.com.br", httpsFunciona: true, anoAtual: 2026 }).problemas).toEqual([]);
  });
  it("rodapé: pega o ano mais novo; ignora números que não são ano", () => {
    expect(anoDoRodape("<p>© 2015 - 2019</p>")).toBe(2019);
    expect(anoDoRodape("<p>&copy; 2021 Empresa</p><p>© Empresa 2018</p>")).toBe(2021);
    expect(anoDoRodape("<p>Copyright © Todos os direitos reservados</p>")).toBeNull();
    expect(anoDoRodape("<p>Telefone 2020-3030</p>")).toBeNull();
    expect(temViewport('<meta content="width=device-width" name=viewport>')).toBe(true);
  });
  it("trava de segurança: só http/https, porta padrão, nome público", () => {
    expect(enderecoPermitido("clinica.com.br")?.toString()).toBe("http://clinica.com.br/");
    expect(enderecoPermitido("https://www.clinica.com.br/inicio")).not.toBeNull();
    for (const u of ["ftp://x.com.br", "http://localhost/", "http://127.0.0.1/", "http://10.0.0.5", "http://[::1]/", "http://x.com.br:8080/", "http://user:senha@x.com.br", "http://intranet/", "http://srv.internal/", "javascript:alert(1)"]) {
      expect(enderecoPermitido(u)).toBeNull();
    }
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(ipInterno(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "200.147.67.142", "2606:4700::1111"]) expect(ipInterno(ip)).toBe(false);
  });
  it("público da busca: site desatualizado só entra quando escolhido", () => {
    expect(publicoDaBusca(false)).toEqual(["sem_site", "rede_social"]);
    expect(publicoDaBusca(true)).toEqual(["sem_site", "rede_social", "desatualizado"]);
  });
});
