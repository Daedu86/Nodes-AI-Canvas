import { describe, expect, it } from "vitest";
import {
  isWorkspaceOnboardingComplete,
  WORKSPACE_ONBOARDING_STORAGE_KEY,
} from "@/lib/client/workspace-onboarding";

describe("workspace onboarding state", () => {
  it("uses a versioned storage key", () => {
    expect(WORKSPACE_ONBOARDING_STORAGE_KEY).toBe(
      "nodes.workspace-onboarding.completed.v1",
    );
  });

  it("only treats the explicit completion marker as complete", () => {
    expect(isWorkspaceOnboardingComplete("1")).toBe(true);
    expect(isWorkspaceOnboardingComplete(null)).toBe(false);
    expect(isWorkspaceOnboardingComplete("0")).toBe(false);
  });
});
