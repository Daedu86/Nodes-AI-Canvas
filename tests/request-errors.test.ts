import { describe, expect, it } from "vitest";
import {
  REQUEST_ERROR_CODE_HEADER,
  REQUEST_ERROR_MESSAGE_HEADER,
  getRequestErrorMessageFromResponse,
  getRequestErrorMessageFromThrowable,
} from "../lib/llm/request-errors";

describe("request error helpers", () => {
  it("prefers explicit backend error messages from response headers", () => {
    const response = new Response(null, {
      status: 503,
      headers: {
        [REQUEST_ERROR_MESSAGE_HEADER]: "OpenRouter is not configured on this deployment.",
      },
    });

    expect(getRequestErrorMessageFromResponse(response)).toBe(
      "OpenRouter is not configured on this deployment.",
    );
  });

  it("maps known response statuses to clearer frontend messages", () => {
    expect(getRequestErrorMessageFromResponse(new Response(null, { status: 429 }))).toBe(
      "The selected model is rate limited right now. Try again in a moment.",
    );
    expect(getRequestErrorMessageFromResponse(new Response(null, { status: 400 }))).toBe(
      "The selected model is not available. Choose another model and try again.",
    );
  });

  it("maps structured backend error codes to user-facing guidance", () => {
    expect(
      getRequestErrorMessageFromResponse(
        new Response(null, {
          status: 429,
          headers: {
            [REQUEST_ERROR_CODE_HEADER]: "chat_concurrency_limited",
            [REQUEST_ERROR_MESSAGE_HEADER]: "Too many assistant runs are already active.",
          },
        }),
      ),
    ).toBe("The assistant is still responding. Wait for it to finish or cancel the current run.");

    expect(
      getRequestErrorMessageFromResponse(
        new Response(null, {
          status: 503,
          headers: {
            [REQUEST_ERROR_CODE_HEADER]: "ollama_unavailable",
          },
        }),
      ),
    ).toBe("Ollama is not reachable. Start it locally or switch to an OpenRouter model.");
  });

  it("maps transport-level failures to a network-focused message", () => {
    expect(getRequestErrorMessageFromThrowable(new Error("fetch failed"))).toBe(
      "The assistant request could not reach the backend. Check the connection and try again.",
    );
  });

  it("maps throwable concurrency and rate-limit messages to clearer text", () => {
    expect(
      getRequestErrorMessageFromThrowable(
        new Error("Too many assistant runs are already active for this user."),
      ),
    ).toBe("The assistant is still responding. Wait for it to finish or cancel the current run.");
    expect(getRequestErrorMessageFromThrowable(new Error("429 rate limit"))).toBe(
      "This model is rate limited right now. Try again in a moment or choose another model.",
    );
  });
});
