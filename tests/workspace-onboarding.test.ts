import { describe, expect, it } from "vitest";
import {
  buildWorkspaceOnboardingStorageKey,
  isWorkspaceOnboardingComplete,
  WORKSPACE_ONBOARDING_STORAGE_KEY_PREFIX,
} from "@/lib/client/workspace-onboarding";

describe("workspace onboarding state", () => {
  it("builds a versioned storage key scoped to the authenticated user", () => {
    expect(WORKSPACE_ONBOARDING_STORAGE_KEY_PREFIX).toBe(
      "nodes.workspace-onboarding.completed",
    );
    expect(buildWorkspaceOnboardingStorageKey("user-42")).toBe(
      "nodes.workspace-onboarding.completed.user-42.v1",
    );
  });

  it("escapes user identifiers and isolates anonymous sessions", () => {
    expect(buildWorkspaceOnboardingStorageKey("user/example")).toBe(
      "nodes.workspace-onboarding.completed.user%2Fexample.v1",
    );
    expect(buildWorkspaceOnboardingStorageKey(null)).toBe(
      "nodes.workspace-onboarding.completed.anonymous.v1",
    );
  });

  it("only treats the explicit completion marker as complete", () => {
    expect(isWorkspaceOnboardingComplete("1")).toBe(true);
    expect(isWorkspaceOnboardingComplete(null)).toBe(false);
    expect(isWorkspaceOnboardingComplete("0")).toBe(false);
  });
});
