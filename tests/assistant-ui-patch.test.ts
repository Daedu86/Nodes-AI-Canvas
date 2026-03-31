/* eslint-disable @typescript-eslint/no-require-imports */
import { describe, expect, it } from "vitest";

const {
  applyAssistantUiPatch,
  currentOriginalBlock,
  currentPatchedBlock,
  legacyOriginalBlock,
  legacyPatchedBlock,
  oldPatchedBlock,
} = require("../scripts/assistant-ui-patch-lib.cjs") as {
  applyAssistantUiPatch: (source: string) => {
    status:
      | "already-applied"
      | "updated-existing-patch"
      | "missing-source-block"
      | "patched";
    nextSource: string;
  };
  currentOriginalBlock: string;
  currentPatchedBlock: string;
  legacyOriginalBlock: string;
  legacyPatchedBlock: string;
  oldPatchedBlock: string;
};

describe("applyAssistantUiPatch", () => {
  it("patches the current assistant-ui block", () => {
    const source = `before\n${currentOriginalBlock}\nafter`;

    const result = applyAssistantUiPatch(source);

    expect(result.status).toBe("patched");
    expect(result.nextSource).toContain(currentPatchedBlock);
    expect(result.nextSource).not.toContain(currentOriginalBlock);
  });

  it("patches the legacy assistant-ui block", () => {
    const source = `before\n${legacyOriginalBlock}\nafter`;

    const result = applyAssistantUiPatch(source);

    expect(result.status).toBe("patched");
    expect(result.nextSource).toContain(legacyPatchedBlock);
    expect(result.nextSource).not.toContain(legacyOriginalBlock);
  });

  it("upgrades the previous debug-heavy patch to the latest version", () => {
    const source = `before\n${oldPatchedBlock}\nafter`;

    const result = applyAssistantUiPatch(source);

    expect(result.status).toBe("updated-existing-patch");
    expect(result.nextSource).toContain(legacyPatchedBlock);
    expect(result.nextSource).not.toContain(oldPatchedBlock);
  });

  it("treats the current patch as already applied", () => {
    const source = `before\n${currentPatchedBlock}\nafter`;

    const result = applyAssistantUiPatch(source);

    expect(result.status).toBe("already-applied");
    expect(result.nextSource).toBe(source);
  });

  it("treats the legacy patch as already applied", () => {
    const source = `before\n${legacyPatchedBlock}\nafter`;

    const result = applyAssistantUiPatch(source);

    expect(result.status).toBe("already-applied");
    expect(result.nextSource).toBe(source);
  });

  it("fails cleanly when the expected block is missing", () => {
    const source = "no matching block here";

    const result = applyAssistantUiPatch(source);

    expect(result.status).toBe("missing-source-block");
    expect(result.nextSource).toBe(source);
  });
});
