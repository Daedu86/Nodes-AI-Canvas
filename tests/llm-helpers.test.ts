import { describe, expect, it } from "vitest";
import { resolveModelConfig } from "../lib/llm/config";
import {
  normalizeMessages,
  selectMessagesForHistoryMode,
  toPlainTextTranscript,
} from "../lib/llm/messages";

describe("llm helpers", () => {
  it("normalizes string and content-array messages into plain text", () => {
    const messages = normalizeMessages([
      { id: "u1", role: "user", content: "Hola" },
      {
        id: "a1",
        role: "assistant",
        content: [
          { type: "text", text: "Linea 1" },
          { type: "text", text: "Linea 2" },
          { type: "tool-call", text: "ignored" },
        ],
      },
      { role: "system", content: { invalid: true } },
    ]);

    expect(messages).toEqual([
      {
        id: "u1",
        role: "user",
        content: "Hola",
        textContent: "Hola",
        parts: [{ type: "text", text: "Hola", summary: "Hola" }],
      },
      {
        id: "a1",
        role: "assistant",
        content: "Linea 1\nLinea 2\n[tool call]",
        textContent: "Linea 1\nLinea 2",
        parts: [
          { type: "text", text: "Linea 1", summary: "Linea 1" },
          { type: "text", text: "Linea 2", summary: "Linea 2" },
          { type: "tool-call", toolName: undefined, summary: "[tool call]" },
        ],
      },
    ]);
    expect(toPlainTextTranscript(messages)).toBe(
      "user: Hola\nassistant: Linea 1\nLinea 2\n[tool call]",
    );
  });

  it("selects only the last user message outside full-history mode", () => {
    const messages = normalizeMessages([
      { role: "user", content: "primero" },
      { role: "assistant", content: "respuesta" },
      { role: "user", content: "ultimo" },
    ]);

    expect(selectMessagesForHistoryMode(messages, "last")).toEqual([
      {
        role: "user",
        content: "ultimo",
        textContent: "ultimo",
        parts: [{ type: "text", text: "ultimo", summary: "ultimo" }],
      },
    ]);
    expect(selectMessagesForHistoryMode(messages, "full")).toEqual(messages);
  });

  it("creates explicit placeholders for attachments, tool results, and sources", () => {
    const messages = normalizeMessages([
      {
        role: "user",
        content: [
          { type: "image", mimeType: "image/png" },
          { type: "file", filename: "brief.pdf" },
          { type: "source", source: { title: "Doc 1" } },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolName: "searchDocs" },
          { type: "tool-result", toolName: "searchDocs", result: { hits: 2 } },
        ],
      },
    ]);

    expect(messages).toEqual([
      {
        role: "user",
        content: "[image: image/png]\n[file: brief.pdf]\n[source: Doc 1]",
        textContent: "",
        parts: [
          { type: "image", mimeType: "image/png", summary: "[image: image/png]" },
          {
            type: "file",
            name: "brief.pdf",
            mimeType: undefined,
            summary: "[file: brief.pdf]",
          },
          { type: "source", summary: "[source: Doc 1]" },
        ],
      },
      {
        role: "assistant",
        content: "[tool call: searchDocs]\n[tool result: searchDocs]",
        textContent: "",
        parts: [
          { type: "tool-call", toolName: "searchDocs", summary: "[tool call: searchDocs]" },
          {
            type: "tool-result",
            toolName: "searchDocs",
            summary: "[tool result: searchDocs]",
          },
        ],
      },
    ]);
  });

  it("resolves provider and model from explicit and inferred config", () => {
    expect(resolveModelConfig({ model: "gemma3:4b" })).toEqual({
      modelId: "gemma3:4b",
      provider: "ollama",
    });

    expect(
      resolveModelConfig({
        runConfig: {
          custom: {
            model: "nvidia/nemotron-3-super-120b-a12b:free",
            provider: "openrouter",
          },
        },
      }),
    ).toEqual({
      modelId: "nvidia/nemotron-3-super-120b-a12b:free",
      provider: "openrouter",
    });
  });
});
