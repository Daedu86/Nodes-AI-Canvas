export const WORKSPACE_ONBOARDING_STORAGE_KEY =
  "nodes.workspace-onboarding.completed.v1";

export const isWorkspaceOnboardingComplete = (storedValue: string | null) =>
  storedValue === "1";
