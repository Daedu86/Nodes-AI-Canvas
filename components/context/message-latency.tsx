"use client";

import React from "react";

type MessageLatencyContextValue = {
  bumpLatencyVersion: () => void;
  latencyVersion: number;
};

const MessageLatencyContext = React.createContext<MessageLatencyContextValue | undefined>(undefined);

export function MessageLatencyProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: MessageLatencyContextValue;
}) {
  return (
    <MessageLatencyContext.Provider value={value}>
      {children}
    </MessageLatencyContext.Provider>
  );
}

export function useMessageLatencyVersion() {
  const context = React.useContext(MessageLatencyContext);
  if (!context) {
    throw new Error("useMessageLatencyVersion must be used within MessageLatencyProvider");
  }
  return context.latencyVersion;
}
