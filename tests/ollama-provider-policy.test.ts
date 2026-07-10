import { describe, expect, it } from "vitest";

import { getMissingProviderCredential } from "../lib/llm/provider-runtime";

describe("Ollama provider policy", () => {
  it("reports Ollama as disabled for this deployment", () => {
    const missing = getMissingProviderCredential("ollama", {
      ollamaBaseUrl: "http://localhost:11434/api",
    });

    expect(missing?.code).toBe("missing_ollama_key");
    expect(missing?.status).toBe(410);
    expect(missing?.message).toContain("disabled");
  });
});
