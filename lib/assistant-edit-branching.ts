"use client";

import { useMemo } from "react";
import type { AssistantRuntime } from "@assistant-ui/react";

export const EDIT_PARENT_KEY = "__assistantEditParentId";
export const EDIT_SOURCE_KEY = "__assistantEditSourceId";
export const ASSISTANT_EDIT_METADATA_KEY = "__assistantEditedFrom";

export function useAssistantEditBranching(runtime: AssistantRuntime | null | undefined) {
  return useMemo(() => runtime ?? null, [runtime]);
}
