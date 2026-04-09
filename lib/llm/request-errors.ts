import type { ResolvedModelConfig } from "@/lib/llm/config";

export const REQUEST_ERROR_CODE_HEADER = "x-nodes-error-code";
export const REQUEST_ERROR_MESSAGE_HEADER = "x-nodes-error-message";
export const RESOLVED_MODEL_HEADER = "x-nodes-resolved-model";
export const RESOLVED_PROVIDER_HEADER = "x-nodes-resolved-provider";
export const MODEL_FALLBACK_HEADER = "x-nodes-model-fallback";

export type RequestErrorCode =
  | "chat_concurrency_limited"
  | "chat_quota_exceeded"
  | "missing_anthropic_key"
  | "missing_google_key"
  | "missing_openai_key"
  | "missing_openrouter_key"
  | "model_unavailable"
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

const OLLAMA_UNAVAILABLE_TOKENS = [
  "econnrefused",
  "connect",
  "localhost:11434",
  "127.0.0.1:11434",
  "ollama",
];

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  return "";
};

const getErrorStatus = (error: unknown): number | null => {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["statusCode", "status", "responseStatus"]) {
      const value = record[key];
      if (typeof value === "number") return value;
    }
    if (record.cause) {
      const nested = getErrorStatus(record.cause);
      if (nested != null) return nested;
    }
  }

  const message = getErrorMessage(error);
  const match = message.match(/\b(400|401|403|404|408|409|422|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : null;
};

export function classifyRequestError(
  error: unknown,
  config: ResolvedModelConfig,
): RequestErrorDetails {
  const message = getErrorMessage(error).toLowerCase();
  const status = getErrorStatus(error);

  if (status === 404 || message.includes("not found") || message.includes("does not exist")) {
    return {
      code: "model_unavailable",
      message: "The selected model is no longer available. Switching models may help.",
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
  if (explicit) return explicit;

  const errorCode = response.headers.get(REQUEST_ERROR_CODE_HEADER);
  if (errorCode === "missing_openai_key") {
    return "OpenAI needs an API key in Profile > LLM Models.";
  }
  if (errorCode === "missing_anthropic_key") {
    return "Anthropic needs an API key in Profile > LLM Models.";
  }
  if (errorCode === "missing_google_key") {
    return "Gemini needs an API key in Profile > LLM Models.";
  }

  if (response.status === 400) {
    return "The selected model is not available. Choose another model and try again.";
  }

  if (response.status === 429) {
    return "The selected model is rate limited right now. Try again in a moment.";
  }

  if (response.status === 503) {
    return "The assistant backend is temporarily unavailable. Try again in a moment.";
  }

  return DEFAULT_ERROR_MESSAGE;
}

export function getRequestErrorMessageFromThrowable(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  if (message.includes("network") || message.includes("fetch") || message.includes("failed")) {
    return "The assistant request could not reach the backend. Check the connection and try again.";
  }
  return DEFAULT_ERROR_MESSAGE;
}
