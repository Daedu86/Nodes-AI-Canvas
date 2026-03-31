"use client";

import React from "react";
import { useSessionUiState } from "@/components/context/session-ui-state";

export type { HistoryMode } from "@/components/context/session-ui-state";

export function HistoryModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

export function useHistoryMode() {
  const { historyMode, setHistoryMode } = useSessionUiState();
  return { historyMode, setHistoryMode };
}
