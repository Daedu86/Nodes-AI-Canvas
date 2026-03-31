import type { SessionDocument, SessionThreadExport } from "@/lib/session-documents";
import type { NormalizedLlmMessage } from "@/lib/llm/messages";
import { normalizeMessages, selectMessagesForHistoryMode, toPlainTextTranscript } from "@/lib/llm/messages";
import type { HistoryMode, ModelConfig } from "@/components/context/session-ui-state";
import {
  estimateTokenCount,
  getBudgetStatus as getNumericBudgetStatus,
  getContextBudgetPolicy,
} from "@/lib/context-budget";

const encoder = new TextEncoder();

export type SessionContextBudget = {
  recommendedPromptTokens: number;
  label: string;
  note: string;
};

export type SessionContextMetrics = {
  text: string;
  estimatedTokens: number;
  bytes: number;
  megabytes: number;
  messageCount: number;
};

export const buildTranscriptMetrics = (
  messages: Array<Pick<NormalizedLlmMessage, "role" | "content">>,
): SessionContextMetrics => {
  const text = toPlainTextTranscript(messages);
  const bytes = encoder.encode(text).length;
  return {
    text,
    estimatedTokens: estimateTokenCount(text),
    bytes,
    megabytes: bytes / (1024 * 1024),
    messageCount: messages.length,
  };
};

export const buildTextMetrics = (text: string, messageCount: number): SessionContextMetrics => {
  const bytes = encoder.encode(text).length;
  return {
    text,
    estimatedTokens: estimateTokenCount(text),
    bytes,
    megabytes: bytes / (1024 * 1024),
    messageCount,
  };
};

export const buildActiveBranchContext = (
  rawMessages: readonly unknown[],
  historyMode: HistoryMode,
) => {
  const normalized = normalizeMessages([...rawMessages]);
  const fullMetrics = buildTranscriptMetrics(normalized);
  const selected = selectMessagesForHistoryMode(normalized, historyMode);
  const payloadMetrics = buildTranscriptMetrics(selected);

  return {
    normalized,
    selected,
    fullMetrics,
    payloadMetrics,
  };
};

export const getSessionTreeStats = (snapshot: SessionThreadExport) => {
  const messageCount = snapshot.messages.length;
  const assistantCount = snapshot.messages.filter((entry) => entry.message?.role === "assistant").length;
  const userCount = snapshot.messages.filter((entry) => entry.message?.role === "user").length;
  const rootCount = snapshot.messages.filter((entry) => entry.parentId === null).length;
  const branchingPoints = new Map<string | null, number>();

  snapshot.messages.forEach((entry) => {
    const key = entry.parentId ?? null;
    branchingPoints.set(key, (branchingPoints.get(key) ?? 0) + 1);
  });

  const siblingGroups = [...branchingPoints.values()].filter((count) => count > 1).length;
  const serialized = JSON.stringify(snapshot, null, 2);
  const bytes = encoder.encode(serialized).length;

  return {
    messageCount,
    assistantCount,
    userCount,
    rootCount,
    siblingGroups,
    bytes,
    megabytes: bytes / (1024 * 1024),
    serialized,
  };
};

export const getStoredSessionDocumentStats = (session: SessionDocument) => {
  const treeStats = getSessionTreeStats(session.snapshot);
  const serialized = JSON.stringify(session, null, 2);
  const bytes = encoder.encode(serialized).length;

  return {
    ...treeStats,
    artifactCount: session.artifacts.length,
    contextLinkCount: session.contextLinks.length,
    bytes,
    megabytes: bytes / (1024 * 1024),
    serialized,
  };
};

export const getRecommendedPromptBudget = (modelConfig: ModelConfig): SessionContextBudget => {
  const policy = getContextBudgetPolicy(modelConfig);
  return {
    recommendedPromptTokens: policy.recommendedPromptTokens,
    label: policy.label,
    note: policy.note,
  };
};

export const getBudgetStatus = (estimatedTokens: number, recommendedTokens: number) => {
  return getNumericBudgetStatus(estimatedTokens, recommendedTokens);
};
