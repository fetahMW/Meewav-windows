export type MarketplaceServiceErrorCode =
  | "invalid_request"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "load_failed"
  | "mutation_failed";

export class MarketplaceServiceError extends Error {
  constructor(
    public readonly code: MarketplaceServiceErrorCode,
    message = code,
    public readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "MarketplaceServiceError";
  }
}

function serverCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const value = error as { code?: unknown; message?: unknown };
  return `${String(value.code ?? "")} ${String(value.message ?? "")}`.toLocaleLowerCase("en-US");
}

export function toMarketplaceServiceError(
  error: unknown,
  fallback: MarketplaceServiceErrorCode,
) {
  if (error instanceof MarketplaceServiceError) return error;
  const code = serverCode(error);
  const mapped = code.includes("jwt") || code.includes("auth")
    ? "unauthenticated"
    : code.includes("forbidden") || code.includes("permission") || code.includes("42501")
      ? "forbidden"
      : code.includes("not_found") || code.includes("p0002")
        ? "not_found"
        : code.includes("conflict") || code.includes("23505") || code.includes("40001")
          ? "conflict"
          : code.includes("rate") || code.includes("429")
            ? "rate_limited"
            : fallback;
  return new MarketplaceServiceError(mapped, mapped, error);
}

export function invalidMarketplaceRequest() {
  return new MarketplaceServiceError("invalid_request");
}
