import { describe, expect, it } from "vitest";
import {
  buildActiveResourceStorageKey,
  dedupeResourceIds,
  prependUniqueResource,
  replaceResourceById,
} from "@/lib/client/persisted-resource-client";

describe("persisted resource client helpers", () => {
  it("builds user-scoped and anonymous active-resource keys", () => {
    expect(buildActiveResourceStorageKey("session", "user-42")).toBe(
      "nodes.active-session-id.user-42",
    );
    expect(buildActiveResourceStorageKey("project", null)).toBe(
      "nodes.active-project-id.v1",
    );
  });

  it("deduplicates and removes empty resource ids", () => {
    expect(dedupeResourceIds(["a", "", "b", "a"])).toEqual(["a", "b"]);
  });

  it("replaces known resources without changing list order", () => {
    expect(
      replaceResourceById(
        [
          { id: "a", value: 1 },
          { id: "b", value: 2 },
        ],
        { id: "b", value: 3 },
      ),
    ).toEqual([
      { id: "a", value: 1 },
      { id: "b", value: 3 },
    ]);
  });

  it("prepends a resource while removing an older copy", () => {
    expect(
      prependUniqueResource(
        [
          { id: "a", value: 1 },
          { id: "b", value: 2 },
        ],
        { id: "b", value: 4 },
      ),
    ).toEqual([
      { id: "b", value: 4 },
      { id: "a", value: 1 },
    ]);
  });
});
