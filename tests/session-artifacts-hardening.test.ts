import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendArtifactRevision,
  parseArtifactOutput,
  type SessionArtifact,
} from "@/lib/session-artifacts";

const artifact: SessionArtifact = {
  id: "artifact-1",
  title: "Draft",
  artifactType: "text",
  semanticType: "draft",
  content: "before",
  revisions: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session artifact hardening", () => {
  it("uses secure UUID generation for revision identifiers", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "123e4567-e89b-42d3-a456-426614174000",
    });

    const updated = appendArtifactRevision(artifact, {
      content: "after",
      origin: "manual",
      author: "user",
    });

    expect(updated.revisions?.[0]?.id).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
  });

  it("fails closed when secure UUID generation is unavailable", () => {
    vi.stubGlobal("crypto", undefined);

    expect(() =>
      appendArtifactRevision(artifact, {
        content: "after",
        origin: "manual",
        author: "user",
      }),
    ).toThrow("Secure random UUID generation is unavailable.");
  });

  it("escapes Markdown-sensitive cells in delimited tables", () => {
    expect(parseArtifactOutput("table", "name,note\nalpha,a|b\nbeta,c\\d")).toBe(
      "| name | note |\n| --- | --- |\n| alpha | a\\|b |\n| beta | c\\\\d |",
    );
  });
});
