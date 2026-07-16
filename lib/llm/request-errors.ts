import type { ResolvedModelConfig } from "@/lib/llm/config";

export const REQUEST_ERROR_CODE_HEADER = "x-nodes-error-code";
export const REQUEST_ERROR_MESSAGE_HEADER = "x-nodes-error-message";
export const RESOLVED_MODEL_HEADER = "x-nodes-resolved-model";
export const RESOLVED_PROVIDER_HEADER = "x-nodes-resolved-provider";
export const MODEL_FALLBACK_HEADER = "x-nodes-model-fallback";

export type RequestErrorCode =
  | "chat_concurrency_limited"
  | "chat_quota_exceeded"
  | "missing_ollama_key"
  | "missing_openrouter_key"
  | "model_unavailable"
  | "provider_request_invalid"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "ollama_unavailable"
  | "backend_unavailable";

export type RequestErrorDetails = {
  code: RequestErrorCode;
  headers?: HeadersInit;
  message: string;
  status: number;
};

const DEFAULT_ERROR_MESSAGE =
  "Assistant request failed. Check the selected model or provider and try again.";
const ACTIVE_RUN_ERROR_MESSAGE =
  "The assistant is still responding. Wait for it to finish or cancel the current run.";
const QUOTA_EXCEEDED_ERROR_MESSAGE =
  "You have hit the current assistant usage limit. Wait a bit before sending another request.";

const OLLAMA_UNAVAILABLE_TOKENS = [
  "econnrefused",
  "connect",
  "localhost:11434",
  "127.0.0.1:11434",
  "ollama",
];

const parsePotentialJson = (value: unknown) => {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const getNestedErrorCandidates = (error: unknown) => {
  if (!error || typeof error !== "object") return [];

  const record = error as Record<string, unknown>;
  const nested: unknown[] = [];

  for (const key of ["cause", "lastError", "error", "data", "metadata"]) {
    if (record[key] != null) nested.push(record[key]);
  }

  if (Array.isArray(record.errors)) {
    nested.push(...record.errors);
  }

  for (const key of ["responseBody", "body"]) {
    const parsed = parsePotentialJson(record[key]);
    if (parsed != null) nested.push(parsed);
  }

  return nested;
};

const getErrorMessage = (error: unknown, seen = new Set<unknown>()): string => {
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (seen.has(error)) return "";

  if (typeof error === "object") {
    seen.add(error);

    if (error instanceof Error && typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }

    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
    if (typeof record.raw === "string" && record.raw.trim()) {
      return record.raw;
    }

    for (const nested of getNestedErrorCandidates(error)) {
      const message = getErrorMessage(nested, seen);
      if (message) return message;
    }
  }

  return "";
};

const getErrorStatus = (error: unknown, seen = new Set<unknown>()): number | null => {
  if (error == null) return null;
  if (seen.has(error)) return null;

  if (typeof error === "object") {
    seen.add(error);

    const record = error as Record<string, unknown>;
    for (const key of ["statusCode", "status", "responseStatus", "code"]) {
      const value = record[key];
      if (
        typeof value === "number" &&
        [400, 401, 403, 404, 408, 409, 422, 429, 500, 502, 503, 504].includes(value)
      ) {
        return value;
      }
    }

    for (const nested of getNestedErrorCandidates(error)) {
      const nestedStatus = getErrorStatus(nested, seen);
      if (nestedStatus != null) return nestedStatus;
    }
  }

  const message = getErrorMessage(error, seen);
  const match = message.match(/\b(400|401|403|404|408|409|422|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : null;
};

export function classifyRequestError(
  error: unknown,
  config: ResolvedModelConfig,
): RequestErrorDetails {
  const message = getErrorMessage(error).toLowerCase();
  const status = getErrorStatus(error);
  const errorName =
    error && typeof error === "object" && "name" in error && typeof error.name === "string"
      ? error.name.toLowerCase()
      : "";

  const isAbortLike =
    errorName.includes("abort") ||
    errorName.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("abort") ||
    message.includes("timeout") ||
    message.includes("timed out");

  if (status === 408 || status === 504 || isAbortLike) {
    return {
      code: "provider_unavailable",
      message: "This model timed out. Try again in a moment or choose another model.",
      status: 503,
    };
  }

  if (status === 404 || message.includes("not found") || message.includes("does not exist")) {
    return {
      code: "model_unavailable",
      message: "The selected model is no longer available. Switching models may help.",
      status: 400,
    };
  }

  if (
    status === 400 ||
    status === 422 ||
    message.includes("bad request") ||
    message.includes("invalid_request") ||
    message.includes("invalid prompt")
  ) {
    return {
      code: "provider_request_invalid",
      message: "The model rejected this conversation context. Try another context or model.",
      status: 400,
    };
  }

  if (status === 429 || message.includes("too many requests") || message.includes("rate limit")) {
    return {
      code: "provider_rate_limited",
      message: "This model is rate limited right now. Try again in a moment or choose another model.",
      status: 429,
    };
  }

  if (
    config.provider === "ollama" &&
    OLLAMA_UNAVAILABLE_TOKENS.some((token) => message.includes(token))
  ) {
    return {
      code: "ollama_unavailable",
      message: "Ollama is not reachable. Start Ollama or switch to an OpenRouter model.",
      status: 503,
    };
  }

  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes("no content") ||
    message.includes("service unavailable") ||
    message.includes("gateway") ||
    message.includes("timed out")
  ) {
    return {
      code: "provider_unavailable",
      message: "The model provider is unavailable right now. Try again in a moment.",
      status: 503,
    };
  }

  return {
    code: "backend_unavailable",
    message: "The assistant backend is unavailable right now. Try again in a moment.",
    status: 503,
  };
}

export function createRequestErrorResponse(details: RequestErrorDetails) {
  const headers = new Headers(details.headers);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set(REQUEST_ERROR_CODE_HEADER, details.code);
  headers.set(REQUEST_ERROR_MESSAGE_HEADER, details.message);
  return new Response(details.message, {
    status: details.status,
    headers,
  });
}

export function createResolvedModelHeaders(options: {
  resolved: ResolvedModelConfig;
  fallbackApplied?: boolean;
}): HeadersInit {
  const headers = new Headers();
  headers.set(RESOLVED_MODEL_HEADER, options.resolved.modelId);
  headers.set(RESOLVED_PROVIDER_HEADER, options.resolved.provider);
  if (options.fallbackApplied) {
    headers.set(MODEL_FALLBACK_HEADER, "1");
  }
  return headers;
}

export function getRequestErrorMessageFromResponse(response: Pick<Response, "status" | "headers">) {
  const explicit = response.headers.get(REQUEST_ERROR_MESSAGE_HEADER);
  const errorCode = response.headers.get(REQUEST_ERROR_CODE_HEADER);
  if (errorCode === "chat_concurrency_limited") {
    return ACTIVE_RUN_ERROR_MESSAGE;
  }
  if (errorCode === "chat_quota_exceeded") {
    return QUOTA_EXCEEDED_ERROR_MESSAGE;
  }
  if (errorCode === "provider_rate_limited") {
    return "This model is rate limited right now. Try again in a moment or choose another model.";
  }
  if (errorCode === "model_unavailable") {
    return "The selected model is not available anymore. Choose another model and try again.";
  }
  if (errorCode === "provider_request_invalid") {
    return "The model rejected this conversation context. Try another context or model.";
  }
  if (errorCode === "ollama_unavailable") {
    return "Ollama is not reachable. Start it locally or switch to an OpenRouter model.";
  }
  if (errorCode === "missing_openrouter_key") {
    return "OpenRouter needs an API key in Profile > LLM Models.";
  }
  if (errorCode === "missing_ollama_key") {
    return "Ollama cloud needs an API key in Profile > LLM Models.";
  }
  if (explicit) return explicit;

  if (response.status === 400) {
    return "The selected model is not available. Choose another model and try again.";
  }

  if (response.status === 429) {
    return "The selected model is rate limited right now. Try again in a moment.";
  }

  if (response.status === 503) {
    return "The assistant backend is temporarily unavailable. Try again in a moment.";
  }
  if (response.status === 504) {
    return "The assistant backend timed out. Try again or switch models.";
  }

  return DEFAULT_ERROR_MESSAGE;
}

export function getRequestErrorMessageFromThrowable(error: unknown) {
  const rawMessage = getErrorMessage(error);
  const message = rawMessage.toLowerCase();
  const status = getErrorStatus(error);
  const errorName =
    error && typeof error === "object" && "name" in error && typeof error.name === "string"
      ? error.name.toLowerCase()
      : "";
  if (
    errorName.includes("abort") ||
    errorName.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("abort") ||
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return "The request timed out. Try again or switch to another model.";
  }
  if (message.includes("too many assistant runs")) {
    return ACTIVE_RUN_ERROR_MESSAGE;
  }
  if (status === 429) {
    return "This model is rate limited right now. Try again in a moment or choose another model.";
  }
  if (status === 400 || status === 404) {
    return "The selected model is not available anymore. Choose another model and try again.";
  }
  if (status === 503) {
    return "The assistant backend is temporarily unavailable. Try again in a moment.";
  }
  if (status === 504) {
    return "The assistant backend timed out. Try again or switch models.";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "This model is rate limited right now. Try again in a moment or choose another model.";
  }
  if (message.includes("network") || message.includes("fetch") || message.includes("failed")) {
    return "The assistant request could not reach the backend. Check the connection and try again.";
  }

  // If the runtime throws a client-safe message (e.g. from the streamed `errorText`),
  // prefer showing it instead of the generic fallback.
  const trimmed = rawMessage.trim();
  if (trimmed) {
    const lower = trimmed.toLowerCase();
    const isSafe =
      trimmed === DEFAULT_ERROR_MESSAGE ||
      trimmed === ACTIVE_RUN_ERROR_MESSAGE ||
      trimmed === QUOTA_EXCEEDED_ERROR_MESSAGE ||
      lower.includes("selected model") ||
      lower.includes("rejected this conversation context") ||
      lower.includes("rate limited") ||
      lower.includes("timed out") ||
      lower.includes("temporarily unavailable") ||
      lower.includes("backend") ||
      trimmed.startsWith("OpenRouter needs an API key") ||
      trimmed.startsWith("Ollama cloud needs an API key");
    if (isSafe && trimmed.length <= 240) {
      return trimmed;
    }
  }
  return DEFAULT_ERROR_MESSAGE;
}
