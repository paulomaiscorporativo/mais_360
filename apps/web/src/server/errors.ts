import "server-only";

/** Erro com mensagem pronta para o usuário (português, acionável). */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code:
      "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID" = "INVALID",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "Você não tem permissão para esta ação.") =>
  new AppError(msg, "FORBIDDEN");
export const notFound = (msg = "Não encontramos o que você procura.") =>
  new AppError(msg, "NOT_FOUND");
