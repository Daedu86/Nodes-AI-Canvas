"use client";

import React from "react";

type Ctx = {
  llmEnabled: boolean;
  setLlmEnabled: (v: boolean) => void;
};

const LlmEnabledContext = React.createContext<Ctx | null>(null);

export function LlmEnabledProvider({
  value,
  setValue,
  children,
}: {
  value: boolean;
  setValue: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const ctx = React.useMemo(() => ({ llmEnabled: value, setLlmEnabled: setValue }), [value, setValue]);
  return <LlmEnabledContext.Provider value={ctx}>{children}</LlmEnabledContext.Provider>;
}

export function useLlmEnabled() {
  const ctx = React.useContext(LlmEnabledContext);
  if (!ctx) throw new Error("useLlmEnabled must be used within LlmEnabledProvider");
  return ctx;
}

