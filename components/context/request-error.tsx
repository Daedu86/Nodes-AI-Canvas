"use client";

import React from "react";

type RequestErrorContextValue = {
  clearRequestError: () => void;
  requestError: string | null;
  setRequestError: (value: string | null) => void;
};

const RequestErrorContext = React.createContext<RequestErrorContextValue | undefined>(undefined);

export function RequestErrorProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: RequestErrorContextValue;
}) {
  return <RequestErrorContext.Provider value={value}>{children}</RequestErrorContext.Provider>;
}

export function useRequestError() {
  const context = React.useContext(RequestErrorContext);
  if (!context) {
    throw new Error("useRequestError must be used within a RequestErrorProvider");
  }
  return context;
}
