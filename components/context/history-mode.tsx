"use client";

import React from "react";

export type HistoryMode = "last" | "full";

type Ctx = {
  historyMode: HistoryMode;
  setHistoryMode: (m: HistoryMode) => void;
};

const HistoryModeContext = React.createContext<Ctx | null>(null);

export function HistoryModeProvider({
  value,
  setValue,
  children,
}: {
  value: HistoryMode;
  setValue: (m: HistoryMode) => void;
  children: React.ReactNode;
}) {
  const ctx = React.useMemo(() => ({ historyMode: value, setHistoryMode: setValue }), [value, setValue]);
  return <HistoryModeContext.Provider value={ctx}>{children}</HistoryModeContext.Provider>;
}

export function useHistoryMode() {
  const ctx = React.useContext(HistoryModeContext);
  if (!ctx) throw new Error("useHistoryMode must be used within HistoryModeProvider");
  return ctx;
}

