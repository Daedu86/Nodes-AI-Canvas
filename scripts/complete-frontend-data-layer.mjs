import { readFile, writeFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const write = (path, content) => writeFile(path, content, "utf8");

const replaceExact = (source, before, after, label) => {
  if (!source.includes(before)) {
    throw new Error(`Missing transformation marker: ${label}`);
  }
  return source.replace(before, after);
};

const replaceRegex = (source, pattern, after, label) => {
  if (!pattern.test(source)) {
    throw new Error(`Missing transformation pattern: ${label}`);
  }
  return source.replace(pattern, after);
};

await write(
  "lib/client/memory-client.ts",
  `import {
  normalizeProjectMemoryItem,
  type ProjectMemoryItem,
  type ProjectMemorySourceKind,
  type ProjectMemoryType,
} from "@/lib/memory-documents";
import { fetchApi, fetchJson } from "@/lib/client/persisted-resource-client";

export type CreateMemoryItemInput = {
  content: string;
  sourceProjectId?: string | null;
  sourceKeys?: string[];
  sourceKind?: ProjectMemorySourceKind;
  sourceSessionId?: string | null;
  title: string;
  type: ProjectMemoryType;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const requireMemoryItem = (value: unknown) => {
  const item = normalizeProjectMemoryItem(value);
  if (!item) throw new Error("Invalid memory item response.");
  return item;
};

export async function fetchMemoryItems(): Promise<ProjectMemoryItem[]> {
  const payload = asRecord(await fetchJson<unknown>("/api/memory"));
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error("Invalid memory list response.");
  }
  return payload.items.map(requireMemoryItem);
}

export async function createMemoryItem(
  input: CreateMemoryItemInput,
): Promise<ProjectMemoryItem> {
  const payload = asRecord(
    await fetchJson<unknown>("/api/memory", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
  return requireMemoryItem(payload?.item);
}

export async function deleteMemoryItem(memoryId: string): Promise<void> {
  await fetchApi(
    "/api/memory/" + encodeURIComponent(memoryId),
    { method: "DELETE" },
    { allowedStatuses: [404] },
  );
}
`,
);

await write(
  "lib/client/llm-settings-client.ts",
  `import {
  normalizeLlmSettingsState,
  type LlmSettingsState,
} from "@/lib/llm/user-settings";
import {
  fetchJson,
  normalizeClientError,
} from "@/lib/client/persisted-resource-client";

export type LlmSettingsPolicy = {
  openrouter: {
    hasDeploymentKey: boolean;
    requireUserKey: boolean;
  };
};

export type LlmSettingsSnapshot = {
  policy: LlmSettingsPolicy;
  settings: LlmSettingsState | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const parsePolicy = (value: unknown): LlmSettingsPolicy => {
  const policy = asRecord(value);
  const openrouter = asRecord(policy?.openrouter);
  return {
    openrouter: {
      hasDeploymentKey: Boolean(openrouter?.hasDeploymentKey),
      requireUserKey: Boolean(openrouter?.requireUserKey),
    },
  };
};

const parseSnapshot = (value: unknown, requireSettings: boolean): LlmSettingsSnapshot => {
  const payload = asRecord(value);
  if (!payload || !("settings" in payload)) {
    throw new Error("Invalid LLM settings response.");
  }

  if (payload.settings === null && !requireSettings) {
    return { policy: parsePolicy(payload.policy), settings: null };
  }
  if (!asRecord(payload.settings)) {
    throw new Error("Invalid LLM settings response.");
  }

  return {
    policy: parsePolicy(payload.policy),
    settings: normalizeLlmSettingsState(payload.settings as Partial<LlmSettingsState>),
  };
};

export async function fetchLlmSettings(): Promise<LlmSettingsSnapshot> {
  try {
    return parseSnapshot(await fetchJson<unknown>("/api/llm/settings"), false);
  } catch (error) {
    throw normalizeClientError(error, "Failed to load LLM settings");
  }
}

export async function persistLlmSettings(
  settings: LlmSettingsState,
): Promise<{ policy: LlmSettingsPolicy; settings: LlmSettingsState }> {
  try {
    const snapshot = parseSnapshot(
      await fetchJson<unknown>("/api/llm/settings", {
        method: "PUT",
        body: JSON.stringify({ settings }),
      }),
      true,
    );
    if (!snapshot.settings) throw new Error("Invalid LLM settings response.");
    return { policy: snapshot.policy, settings: snapshot.settings };
  } catch (error) {
    throw normalizeClientError(error, "Failed to save LLM settings");
  }
}
`,
);

let resourceClient = await read("lib/client/persisted-resource-client.ts");
resourceClient = replaceExact(
  resourceClient,
  `export type ClientHttpError = Error & {\n  payload?: unknown;\n  status?: number;\n};\n`,
  `export type ClientHttpError = Error & {\n  payload?: unknown;\n  status?: number;\n};\n\nconst asRecord = (value: unknown): Record<string, unknown> | null =>\n  typeof value === "object" && value !== null\n    ? (value as Record<string, unknown>)\n    : null;\n\nexport function getClientHttpErrorMessage(error: unknown, fallback: string) {\n  const record = asRecord(error);\n  const payload = asRecord(record?.payload);\n  const payloadMessage = [payload?.error, payload?.message].find(\n    (value): value is string => typeof value === "string" && value.trim().length > 0,\n  );\n  if (payloadMessage) return payloadMessage.trim();\n\n  if (typeof record?.status === "number") {\n    return \`${fallback}: \${record.status}\`;\n  }\n  if (error instanceof Error && error.message.trim().length > 0) {\n    return error.message;\n  }\n  return fallback;\n}\n\nexport function normalizeClientError(error: unknown, fallback: string): Error {\n  const message = getClientHttpErrorMessage(error, fallback);\n  if (error instanceof Error) {\n    error.message = message;\n    return error;\n  }\n  return new Error(message);\n}\n`,
  "client error helpers",
);
resourceClient = replaceExact(
  resourceClient,
  `export function prependUniqueResource<T extends { id: string }>(\n  resources: T[],\n  resource: T,\n) {\n  return [resource, ...resources.filter((item) => item.id !== resource.id)];\n}\n`,
  `export function prependUniqueResource<T extends { id: string }>(\n  resources: T[],\n  resource: T,\n) {\n  return [resource, ...resources.filter((item) => item.id !== resource.id)];\n}\n\nexport function removeResourceById<T extends { id: string }>(\n  resources: T[],\n  resourceId: string,\n) {\n  return resources.filter((item) => item.id !== resourceId);\n}\n`,
  "remove resource helper",
);
await write("lib/client/persisted-resource-client.ts", resourceClient);

await write(
  "components/context/reusable-memory.tsx",
  `"use client";

import React from "react";
import {
  createMemoryItem as createMemoryItemRequest,
  deleteMemoryItem as deleteMemoryItemRequest,
  fetchMemoryItems,
  type CreateMemoryItemInput,
} from "@/lib/client/memory-client";
import {
  prependUniqueResource,
  removeResourceById,
} from "@/lib/client/persisted-resource-client";
import type { ProjectMemoryItem } from "@/lib/memory-documents";

type ReusableMemoryContextValue = {
  createMemoryItem: (input: CreateMemoryItemInput) => Promise<ProjectMemoryItem>;
  deleteMemoryItem: (memoryId: string) => Promise<void>;
  isReady: boolean;
  items: ProjectMemoryItem[];
  refreshMemoryItems: () => Promise<ProjectMemoryItem[]>;
};

const ReusableMemoryContext = React.createContext<ReusableMemoryContextValue | null>(null);

export function ReusableMemoryProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ProjectMemoryItem[]>([]);
  const [isReady, setIsReady] = React.useState(false);

  const refreshMemoryItems = React.useCallback(async () => {
    const nextItems = await fetchMemoryItems();
    setItems(nextItems);
    return nextItems;
  }, []);

  React.useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      try {
        await refreshMemoryItems();
      } finally {
        if (mounted) setIsReady(true);
      }
    };
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [refreshMemoryItems]);

  const createMemoryItem = React.useCallback(async (input: CreateMemoryItemInput) => {
    const item = await createMemoryItemRequest(input);
    setItems((previous) => prependUniqueResource(previous, item));
    return item;
  }, []);

  const deleteMemoryItem = React.useCallback(async (memoryId: string) => {
    await deleteMemoryItemRequest(memoryId);
    setItems((previous) => removeResourceById(previous, memoryId));
  }, []);

  const value = React.useMemo<ReusableMemoryContextValue>(
    () => ({
      createMemoryItem,
      deleteMemoryItem,
      isReady,
      items,
      refreshMemoryItems,
    }),
    [createMemoryItem, deleteMemoryItem, isReady, items, refreshMemoryItems],
  );

  return (
    <ReusableMemoryContext.Provider value={value}>
      {children}
    </ReusableMemoryContext.Provider>
  );
}

export function useReusableMemory() {
  const context = React.useContext(ReusableMemoryContext);
  if (!context) {
    throw new Error("useReusableMemory must be used within ReusableMemoryProvider");
  }
  return context;
}
`,
);

let llmSettings = await read("components/context/llm-settings.tsx");
llmSettings = replaceExact(
  llmSettings,
  `import type { ModelConfig } from "@/components/context/model-config";\n`,
  `import type { ModelConfig } from "@/components/context/model-config";\nimport {\n  fetchLlmSettings,\n  persistLlmSettings,\n  type LlmSettingsPolicy,\n} from "@/lib/client/llm-settings-client";\n`,
  "llm settings client import",
);
llmSettings = replaceRegex(
  llmSettings,
  /type LlmSettingsResponse = \{[\s\S]*?\n\};\n\n(?=type LlmSettingsContextValue)/u,
  "",
  "remove llm response type",
);
llmSettings = replaceExact(
  llmSettings,
  `  policy: {\n    openrouter: {\n      hasDeploymentKey: boolean;\n      requireUserKey: boolean;\n    };\n  };\n`,
  `  policy: LlmSettingsPolicy;\n`,
  "llm policy type",
);
llmSettings = replaceRegex(
  llmSettings,
  /async function fetchLlmSettings\(\) \{[\s\S]*?\n\}\n\nasync function persistLlmSettings\(settings: LlmSettingsState\) \{[\s\S]*?\n\}\n\n(?=export function LlmSettingsProvider)/u,
  "",
  "remove inline llm transport",
);
await write("components/context/llm-settings.tsx", llmSettings);

let resourceTests = await read("tests/persisted-resource-client.test.ts");
resourceTests = replaceExact(
  resourceTests,
  `  prependUniqueResource,\n  replaceResourceById,\n`,
  `  prependUniqueResource,\n  removeResourceById,\n  replaceResourceById,\n`,
  "resource test import",
);
resourceTests = replaceExact(
  resourceTests,
  `  it("prepends a resource while removing an older copy", () => {\n`,
  `  it("removes a resource by id without changing the remaining order", () => {\n    expect(\n      removeResourceById(\n        [\n          { id: "a", value: 1 },\n          { id: "b", value: 2 },\n          { id: "c", value: 3 },\n        ],\n        "b",\n      ),\n    ).toEqual([\n      { id: "a", value: 1 },\n      { id: "c", value: 3 },\n    ]);\n  });\n\n  it("prepends a resource while removing an older copy", () => {\n`,
  "resource removal test",
);
await write("tests/persisted-resource-client.test.ts", resourceTests);

await write(
  "tests/memory-client.test.ts",
  `import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryItem,
  deleteMemoryItem,
  fetchMemoryItems,
} from "@/lib/client/memory-client";

const memoryItem = {
  content: "Decision content",
  createdAt: "2026-07-14T00:00:00.000Z",
  id: "memory-1",
  sourceProjectId: null,
  sourceKeys: [],
  sourceKind: null,
  sourceSessionId: null,
  title: "Decision",
  type: "decision" as const,
  updatedAt: "2026-07-14T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("memory client", () => {
  it("loads and normalizes memory items", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [memoryItem] }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMemoryItems()).resolves.toEqual([memoryItem]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/memory",
      expect.objectContaining({ headers: { "Content-Type": "application/json" } }),
    );
  });

  it("creates one memory item through the shared JSON client", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ item: memoryItem }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createMemoryItem({
        content: memoryItem.content,
        title: memoryItem.title,
        type: memoryItem.type,
      }),
    ).resolves.toEqual(memoryItem);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/memory",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("accepts an already deleted memory item", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteMemoryItem("memory/1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/memory/memory%2F1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("rejects malformed list payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [{ id: "broken" }] }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      ),
    );

    await expect(fetchMemoryItems()).rejects.toThrow("Invalid memory item response.");
  });
});
`,
);

await write(
  "tests/llm-settings-client.test.ts",
  `import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLlmSettings,
  persistLlmSettings,
} from "@/lib/client/llm-settings-client";
import { cloneDefaultLlmSettingsState } from "@/lib/llm/user-settings";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LLM settings client", () => {
  it("loads an empty settings snapshot and normalizes policy flags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            policy: { openrouter: { hasDeploymentKey: 1, requireUserKey: false } },
            settings: null,
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
      ),
    );

    await expect(fetchLlmSettings()).resolves.toEqual({
      policy: {
        openrouter: { hasDeploymentKey: true, requireUserKey: false },
      },
      settings: null,
    });
  });

  it("persists normalized settings through the shared JSON client", async () => {
    const settings = cloneDefaultLlmSettingsState();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          policy: { openrouter: { hasDeploymentKey: false, requireUserKey: true } },
          settings,
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(persistLlmSettings(settings)).resolves.toEqual({
      policy: {
        openrouter: { hasDeploymentKey: false, requireUserKey: true },
      },
      settings,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/llm/settings",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("uses an API error message while preserving the typed HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Provider credentials are invalid." }), {
          headers: { "Content-Type": "application/json" },
          status: 400,
        }),
      ),
    );

    await expect(persistLlmSettings(cloneDefaultLlmSettingsState())).rejects.toMatchObject({
      message: "Provider credentials are invalid.",
      status: 400,
    });
  });

  it("rejects malformed successful payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ policy: {} }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      ),
    );

    await expect(fetchLlmSettings()).rejects.toThrow("Invalid LLM settings response.");
  });
});
`,
);
