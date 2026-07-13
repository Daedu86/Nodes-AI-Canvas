import { describe, expect, it } from "vitest";
import {
  formatMemoryTitle,
  formatProjectTitle,
  formatSessionTitle,
  summarizePreviewText,
} from "@/components/workspace/project-workspace-utils";

describe("project workspace utilities", () => {
  it("provides stable fallback titles", () => {
    expect(formatProjectTitle(null)).toBe("Untitled Project");
    expect(formatSessionTitle("   ")).toBe("Untitled Session");
    expect(formatMemoryTitle("  ")).toBe("Untitled Memory");
  });

  it("normalizes and truncates preview text", () => {
    expect(summarizePreviewText("  one\n  two  ")).toBe("one two");
    expect(summarizePreviewText("abcdefghij", 8)).toBe("abcde...");
  });
});
