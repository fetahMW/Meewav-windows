export type WaveProductionErrorCode =
  | "INVALID_INPUT"
  | "CONTRACT_MISSING"
  | "NOT_CONFIGURED"
  | "BACKEND_UNAVAILABLE"
  | "INVALID_BACKEND_RESPONSE";

export class WaveProductionError extends Error {
  readonly name = "WaveProductionError";
  readonly cause: unknown;

  constructor(
    readonly code: WaveProductionErrorCode,
    readonly operation: string,
    message: string,
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.cause = options?.cause;
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "";
}

function statusCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const row = error as Record<string, unknown>;
  if (typeof row.status === "number") return row.status;
  if (row.context && typeof row.context === "object") {
    const nested = row.context as Record<string, unknown>;
    if (typeof nested.status === "number") return nested.status;
  }
  return null;
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const row = error as Record<string, unknown>;
  return typeof row.code === "string" ? row.code : "";
}

export function productionBackendFailure(operation: string, error: unknown) {
  const message = errorMessage(error);
  const status = statusCode(error);
  const code = errorCode(error);
  if (status === 404 || code === "PGRST202" || code === "42883" || /function(?: [^ ]+)? does not exist|schema cache|not found/iu.test(message)) {
    return new WaveProductionError(
      "CONTRACT_MISSING",
      operation,
      `Le contrat backend requis pour « ${operation} » n'est pas déployé.`,
      false,
      { cause: error },
    );
  }
  return new WaveProductionError(
    "BACKEND_UNAVAILABLE",
    operation,
    `Le backend n'a pas confirmé l'opération « ${operation} ».`,
    status === null || status === 408 || status === 429 || status >= 500,
    { cause: error },
  );
}

export function invalidProductionInput(operation: string, detail: string) {
  return new WaveProductionError("INVALID_INPUT", operation, detail, false);
}

export function invalidProductionResponse(operation: string) {
  return new WaveProductionError(
    "INVALID_BACKEND_RESPONSE",
    operation,
    `La réponse backend pour « ${operation} » ne respecte pas le contrat Wave normalisé.`,
    false,
  );
}

export function missingProductionContract(operation: string, rpcName: string) {
  return new WaveProductionError(
    "CONTRACT_MISSING",
    operation,
    `Le RPC public « ${rpcName} » est requis mais absent des migrations Wave V3/V5.`,
    false,
  );
}

export function productionNotConfigured(operation: string, detail: string) {
  return new WaveProductionError("NOT_CONFIGURED", operation, detail, false);
}
