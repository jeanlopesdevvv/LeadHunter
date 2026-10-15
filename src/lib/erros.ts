/** Erro de leitura/gravação da lista de leads (planilha ou banco), com o status HTTP a devolver. */
export class SheetsError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
