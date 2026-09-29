import { describe, expect, it } from "vitest";

import { placeToLead } from "@/lib/places";

describe("placeToLead", () => {
  it("converte o retorno da Places API no lead da planilha", () => {
    const lead = placeToLead(
      {
        id: "ChIJ123",
        displayName: { text: "Lava Jato Savassi" },
        formattedAddress: "R. Pernambuco, 100 - Savassi, Belo Horizonte - MG, 30130-150, Brasil",
        addressComponents: [
          { longText: "Savassi", types: ["sublocality_level_1", "sublocality", "political"] },
          { longText: "Belo Horizonte", shortText: "Belo Horizonte", types: ["administrative_area_level_2", "political"] },
          { longText: "Minas Gerais", shortText: "MG", types: ["administrative_area_level_1", "political"] },
        ],
        nationalPhoneNumber: "(31) 98299-9779",
        internationalPhoneNumber: "+55 31 98299-9779",
        rating: 4.8,
        userRatingCount: 120,
        googleMapsUri: "https://maps.google.com/?cid=1",
        businessStatus: "OPERATIONAL",
      },
      "lava jato",
      "Belo Horizonte - MG",
    );
    expect(lead).toMatchObject({
      telefone: "5531982999779",
      telefoneTipo: "celular",
      nome: "Lava Jato Savassi",
      tipo: "Empresa",
      cidade: "Belo Horizonte",
      uf: "MG",
      bairro: "Savassi",
    });
  });

  it("sem cidade no endereço usa a cidade buscada", () => {
    const lead = placeToLead({ id: "x", displayName: { text: "Marcos Lavador" }, pureServiceAreaBusiness: true }, "lava jato", "Contagem - MG");
    expect(lead.cidade).toBe("Contagem");
    expect(lead.tipo).toBe("Autônomo");
    expect(lead.telefoneTipo).toBe("ausente");
  });
});
