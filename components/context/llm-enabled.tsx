"use client";

import React from "react";
import { useSessionUiState } from "@/components/context/session-ui-state";

export function LlmEnabledProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

export function useLlmEnabled() {
  const { llmEnabled, setLlmEnabled } = useSessionUiState();
  return { llmEnabled, setLlmEnabled };
}
