import { describe, expect, it } from "vitest";

import { getMissingProviderCredential } from "../lib/llm/provider-runtime";

describe("Ollama provider policy", () => {
  it("does not require a key for local Ollama endpoints", () => {
    const missing = getMissingProviderCredential("ollama", {
      ollamaBaseUrl: "http://localhost:11434/api",
    });
    expect(missing).toBeNull();
  });

  it("requires a user key for ollama.com endpoints", () => {
    const missing = getMissingProviderCredential("ollama", {
      ollamaBaseUrl: "https://ollama.com/api",
    });
    expect(missing?.code).toBe("missing_ollama_key");
    expect(missing?.status).toBe(401);
  });
});
