import { describe, expect, it } from "vitest";
import {
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

  it("maps transport-level failures to a network-focused message", () => {
    expect(getRequestErrorMessageFromThrowable(new Error("fetch failed"))).toBe(
      "The assistant request could not reach the backend. Check the connection and try again.",
    );
  });
});
