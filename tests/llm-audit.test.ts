import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLlmAuditContext,
  getLlmUsageMetrics,
  logLlmAuditAccepted,
  logLlmAuditCompleted,
} from "../lib/server/llm-audit";

const requested = {
  modelId: "openrouter/free",
  provider: "openrouter" as const,
};

const parseEvent = (call: unknown[]) => JSON.parse(String(call[0])) as Record<string, unknown>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LLM observability", () => {
  it("emits structured events without user identifiers or prompt content", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const context = createLlmAuditContext({
      actorType: "agent",
      contextArtifactCount: 2,
      historyMode: "last",
      messageCount: 5,
      requested,
      route: "/api/chat",
      sentMessageCount: 3,
      toolCount: 1,
    });
    context.startedAt = Date.now() - 40;

    logLlmAuditAccepted(context, {
      quota: {
        active: 1,
        concurrentLimit: 3,
        plan: "free",
        remainingDay: 119,
        remainingHour: 39,
        remainingMinute: 7,
        reservationMs: 4,
        retryAfterSeconds: null,
      },
    });
    logLlmAuditCompleted(context, requested, {
      attemptCount: 1,
      fallbackApplied: false,
      finishReason: "stop",
      timing: {
        durationMs: 120,
        providerDurationMs: 80,
        providerTimeToFirstChunkMs: 15,
        providerTimeToFirstTokenMs: 20,
        timeToFirstChunkMs: 55,
        timeToFirstTokenMs: 60,
      },
      usage: {
        cacheReadTokens: 10,
        cacheWriteTokens: 2,
        inputTokens: 100,
        outputTokens: 30,
        reasoningTokens: 5,
        textTokens: 25,
        totalTokens: 130,
      },
    });

    expect(info).toHaveBeenCalledTimes(2);
    const accepted = parseEvent(info.mock.calls[0]!);
    const completed = parseEvent(info.mock.calls[1]!);
    expect(accepted).toMatchObject({
      actorType: "agent",
      event: "request_accepted",
      messageCount: 5,
      sentMessageCount: 3,
      source: "nodes-llm-observability",
      status: "accepted",
      toolCount: 1,
    });
    expect(completed).toMatchObject({
      event: "request_completed",
      finishReason: "stop",
      metrics: {
        attemptCount: 1,
        timeToFirstTokenMs: 60,
      },
      status: "completed",
      usage: {
        inputTokens: 100,
        outputTokens: 30,
        totalTokens: 130,
      },
    });

    const serialized = JSON.stringify([accepted, completed]);
    expect(serialized).not.toContain("userId");
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("prompt");
  });

  it("extracts only normalized token counters from SDK completion events", () => {
    expect(
      getLlmUsageMetrics({
        usage: {
          inputTokens: 120,
          inputTokenDetails: {
            cacheReadTokens: 40,
            cacheWriteTokens: 5,
          },
          outputTokens: 35,
          outputTokenDetails: {
            reasoningTokens: 8,
            textTokens: 27,
          },
          totalTokens: 155,
          raw: { secretProviderPayload: "ignored" },
        },
      }),
    ).toEqual({
      cacheReadTokens: 40,
      cacheWriteTokens: 5,
      inputTokens: 120,
      outputTokens: 35,
      reasoningTokens: 8,
      textTokens: 27,
      totalTokens: 155,
    });
  });
});
