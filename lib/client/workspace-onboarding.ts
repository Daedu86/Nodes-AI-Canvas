export const WORKSPACE_ONBOARDING_STORAGE_KEY_PREFIX =
  "nodes.workspace-onboarding.completed";

const ANONYMOUS_ONBOARDING_OWNER = "anonymous";

export const buildWorkspaceOnboardingStorageKey = (userId: string | null) => {
  const owner = userId ? encodeURIComponent(userId) : ANONYMOUS_ONBOARDING_OWNER;
  return `${WORKSPACE_ONBOARDING_STORAGE_KEY_PREFIX}.${owner}.v1`;
};

export const isWorkspaceOnboardingComplete = (storedValue: string | null) =>
  storedValue === "1";
