"use client";

import React from "react";
import { useSessionUiState } from "@/components/context/session-ui-state";

export type { ModelConfig, ModelProvider } from "@/components/context/session-ui-state";

export function ModelConfigProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

export function useModelConfig() {
  const { modelConfig, setModelConfig } = useSessionUiState();
  return {
    ...modelConfig,
    setModelConfig,
  };
}
