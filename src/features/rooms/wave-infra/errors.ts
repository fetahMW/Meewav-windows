export type WaveInfraErrorCode =
  | "INVALID_INPUT"
  | "CONTRACT_MISSING"
  | "BACKEND_UNAVAILABLE"
  | "INVALID_BACKEND_RESPONSE"
  | "REALTIME_GAP"
  | "DIRECT_UPLOAD_FAILED"
  | "LOCAL_ONLY_UNAVAILABLE";

export class WaveInfraError extends Error {
  readonly name = "WaveInfraError";
  readonly cause: unknown;

  constructor(
    readonly code: WaveInfraErrorCode,
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
  const record = error as Record<string, unknown>;
  if (typeof record.status === "number") return record.status;
  if (record.context && typeof record.context === "object" && typeof (record.context as Record<string, unknown>).status === "number") {
    return (record.context as Record<string, unknown>).status as number;
  }
  return null;
}

export function backendFailure(operation: string, error: unknown) {
  const message = errorMessage(error);
  const status = statusCode(error);
  const missing = status === 404
    || /not found|does not exist|could not find|schema cache|function missing|PGRST202|42883|42P01/iu.test(message);
  if (missing) {
    return new WaveInfraError(
      "CONTRACT_MISSING",
      operation,
      `Le contrat backend La Wave requis pour « ${operation} » n'est pas déployé.`,
      false,
      { cause: error },
    );
  }
  return new WaveInfraError(
    "BACKEND_UNAVAILABLE",
    operation,
    `Le backend La Wave n'a pas confirmé l'opération « ${operation} ».`,
    status === null || status >= 500 || status === 408 || status === 429,
    { cause: error },
  );
}

export function invalidInput(operation: string, detail: string) {
  return new WaveInfraError("INVALID_INPUT", operation, detail, false);
}

export function invalidResponse(operation: string) {
  return new WaveInfraError(
    "INVALID_BACKEND_RESPONSE",
    operation,
    `Réponse backend La Wave invalide pour « ${operation} ».`,
    false,
  );
}
