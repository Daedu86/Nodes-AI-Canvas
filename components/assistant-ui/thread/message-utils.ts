import type { AssistantRuntime } from "@assistant-ui/react";
import type { ThreadRepoItem } from "@/components/assistant-ui/use-thread-repo-items";
import { getMessageLatencyEntry } from "@/lib/message-latency-registry";
import { getModelEntry } from "@/lib/message-model-registry";
import { computeSiblingGroupId } from "@/lib/sibling-group";

export type MessageLike = {
  id?: string;
  parentId?: string | null;
  branchId?: unknown;
  role?: string;
  metadata?: { custom?: Record<string, unknown> };
};

export type SiblingInfo = {
  siblingIdStr: string;
  parentIdDisplay: string | null;
};

export type ResolvedModelInfo = {
  model: string;
  provider: string;
};

export type ResolvedLatencyInfo = {
  responseStartMs: number | null;
  totalMs: number | null;
};

const DEFAULT_SIBLING_INFO: SiblingInfo = { siblingIdStr: "", parentIdDisplay: null };

export const resolveRuntimeParentId = (
  messageId: string | null | undefined,
  runtime: AssistantRuntime | null | undefined,
  getParentOverride: (childId?: string | null, fallback?: string | null) => string | null,
) => {
  if (!messageId) return null;
  const mainThread = runtime?.threads?.main;
  if (!mainThread?.export) return null;

  try {
    const exportValue = mainThread.export();
    const items = Array.isArray(exportValue?.messages)
      ? (exportValue.messages as ThreadRepoItem[])
      : [];
    const item = items.find((entry) => String(entry.message?.id ?? "") === messageId);
    return getParentOverride(messageId, item?.parentId ?? null);
  } catch {
    return null;
  }
};

export const resolveSiblingInfo = (
  message: MessageLike | null | undefined,
  runtime: AssistantRuntime | null | undefined,
  getParentOverride: (childId?: string | null, fallback?: string | null) => string | null,
): SiblingInfo => {
  if (!message) return DEFAULT_SIBLING_INFO;
  const id = message.id ?? "";
  const parentId = resolveRuntimeParentId(id, runtime, getParentOverride);
  if (!id) {
    return { siblingIdStr: "", parentIdDisplay: parentId };
  }
  const mainThread = runtime?.threads?.main;
  if (!mainThread?.export) {
    return { siblingIdStr: "", parentIdDisplay: parentId };
  }
  try {
    const exportValue = mainThread.export();
    const items = Array.isArray(exportValue?.messages)
      ? (exportValue.messages as ThreadRepoItem[])
      : [];
    const hasSibling = items.some((item) => {
      const childId = String(item.message?.id ?? "");
      const itemParentId = getParentOverride(childId, item.parentId ?? null);
      return childId && childId !== id && itemParentId === parentId;
    });
    if (hasSibling && typeof parentId === "string" && parentId.length > 0) {
      return {
        siblingIdStr: computeSiblingGroupId(parentId),
        parentIdDisplay: parentId,
      };
    }
  } catch {
    // ignore export errors
  }
  return { siblingIdStr: "", parentIdDisplay: parentId };
};

export const getBranchIdValue = (message: MessageLike | null | undefined): string | null => {
  if (!message) return null;
  if (!Object.prototype.hasOwnProperty.call(message, "branchId")) return null;
  const value = message.branchId;
  if (value === null || value === undefined) return "-";
  return String(value);
};

export const resolveModel = (
  message: MessageLike | null | undefined,
  fallbackModelId: string,
  fallbackProvider: string,
): ResolvedModelInfo => {
  const custom = (message?.metadata?.custom as Record<string, unknown> | undefined) ?? {};
  const fromMessage =
    typeof custom.model === "string"
      ? { model: custom.model, provider: custom.provider as string | undefined }
      : null;
  if (fromMessage?.model) {
    const provider =
      fromMessage.provider === "ollama" || fromMessage.provider === "openrouter"
        ? fromMessage.provider
        : fallbackProvider;
    return { model: fromMessage.model, provider };
  }
  const id = message?.id;
  const fromRegistry = id ? getModelEntry(id) : undefined;
  if (fromRegistry?.model) {
    const provider =
      fromRegistry.provider === "ollama" || fromRegistry.provider === "openrouter"
        ? fromRegistry.provider
        : fallbackProvider;
    return { model: fromRegistry.model, provider };
  }
  return { model: fallbackModelId, provider: fallbackProvider };
};

export const resolveLatency = (
  message: MessageLike | null | undefined,
): ResolvedLatencyInfo | null => {
  const id = message?.id;
  if (!id) return null;
  const entry = getMessageLatencyEntry(id);
  if (!entry) return null;
  return {
    responseStartMs: typeof entry.responseStartMs === "number" ? entry.responseStartMs : null,
    totalMs: typeof entry.totalMs === "number" ? entry.totalMs : null,
  };
};
