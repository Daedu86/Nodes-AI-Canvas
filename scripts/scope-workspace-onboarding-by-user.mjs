import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const write = (path, content) => {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
};
const create = (path, content) => {
  const target = resolve(root, path);
  if (existsSync(target)) throw new Error(`Refusing to overwrite ${path}`);
  write(path, content);
};

write(
  "lib/client/workspace-onboarding.ts",
  `export const WORKSPACE_ONBOARDING_STORAGE_KEY_PREFIX =
  "nodes.workspace-onboarding.completed";

const ANONYMOUS_ONBOARDING_OWNER = "anonymous";

export const buildWorkspaceOnboardingStorageKey = (userId: string | null) => {
  const owner = userId ? encodeURIComponent(userId) : ANONYMOUS_ONBOARDING_OWNER;
  return \`\${WORKSPACE_ONBOARDING_STORAGE_KEY_PREFIX}.\${owner}.v1\`;
};

export const isWorkspaceOnboardingComplete = (storedValue: string | null) =>
  storedValue === "1";
`,
);

write(
  "components/workspace/workspace-onboarding-dialog.tsx",
  `"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { CircleHelp, MessageSquareText, Network, Workflow, X } from "lucide-react";
import React from "react";
import {
  buildWorkspaceOnboardingStorageKey,
  isWorkspaceOnboardingComplete,
} from "@/lib/client/workspace-onboarding";

type WorkspaceOnboardingDialogProps = {
  onOpenCanvas: () => void;
  userId: string | null;
};

const onboardingSteps = [
  {
    description: "Start with a concrete question or decision in Chat.",
    icon: MessageSquareText,
    title: "Ask",
  },
  {
    description: "Open Canvas to see branches, alternatives, and reusable context.",
    icon: Workflow,
    title: "Explore",
  },
  {
    description: "Add blocks and connect evidence, files, plans, and outputs.",
    icon: Network,
    title: "Structure",
  },
];

export function WorkspaceOnboardingDialog({
  onOpenCanvas,
  userId,
}: WorkspaceOnboardingDialogProps) {
  const [open, setOpen] = React.useState(false);
  const storageKey = React.useMemo(
    () => buildWorkspaceOnboardingStorageKey(userId),
    [userId],
  );

  React.useEffect(() => {
    try {
      setOpen(!isWorkspaceOnboardingComplete(localStorage.getItem(storageKey)));
    } catch {
      setOpen(false);
    }
  }, [storageKey]);

  const completeOnboarding = React.useCallback(() => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // Ignore storage failures; the dialog remains manually accessible.
    }
    setOpen(false);
  }, [storageKey]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) completeOnboarding();
      else setOpen(true);
    },
    [completeOnboarding],
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open workspace guide"
          title="Workspace guide"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,42rem)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-border/70 bg-background p-6 shadow-2xl focus:outline-none sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">
                Workspace guide
              </p>
              <Dialog.Title className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                Turn a question into a structured decision
              </Dialog.Title>
              <Dialog.Description className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Nodes combines a conversational thread with a visual canvas. You can move between both without losing context.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close workspace guide"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {onboardingSteps.map(({ description, icon: Icon, title }, index) => (
              <li key={title} className="rounded-2xl border border-border/70 bg-muted/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground">0{index + 1}</span>
                </div>
                <h2 className="mt-4 text-sm font-semibold text-foreground">{title}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-border/70 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={completeOnboarding}
            >
              Got it
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                onOpenCanvas();
                completeOnboarding();
              }}
            >
              <Workflow className="h-4 w-4" />
              Open split workspace
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
`,
);

let header = read("components/workspace/app-header.tsx");
header = header.replace(
  'import React from "react";\n',
  'import React from "react";\nimport { useSession } from "next-auth/react";\n',
);
header = header.replace(
  '  const { llmEnabled } = useLlmEnabled();\n',
  '  const { llmEnabled } = useLlmEnabled();\n  const { data: session } = useSession();\n',
);
header = header.replace(
  '<WorkspaceOnboardingDialog onOpenCanvas={() => setViewMode("split")} />',
  '<WorkspaceOnboardingDialog\n          onOpenCanvas={() => setViewMode("split")}\n          userId={session?.user?.id ?? null}\n        />',
);
write("components/workspace/app-header.tsx", header);

write(
  "tests/workspace-onboarding.test.ts",
  `import { describe, expect, it } from "vitest";
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
`,
);

write(
  "tests/app-header.test.tsx",
  `// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SessionUiStateProvider, useSessionUiState } from "@/components/context/session-ui-state";
import { AppHeader } from "@/components/workspace/app-header";
import { buildWorkspaceOnboardingStorageKey } from "@/lib/client/workspace-onboarding";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "header-user" } },
    status: "authenticated",
  }),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Sidebar</button>,
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <div data-testid="separator" />,
}));

vi.mock("@/components/ui/breadcrumb", () => ({
  Breadcrumb: ({ children }: { children: React.ReactNode }) => <nav>{children}</nav>,
  BreadcrumbItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BreadcrumbList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BreadcrumbPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/assistant-ui/thread-title", () => ({
  ThreadTitleEditor: () => <span>Thread</span>,
}));

vi.mock("@/components/assistant-ui/model-selector", () => ({
  ModelSelector: () => <div>Model selector</div>,
}));

vi.mock("@/components/assistant-ui/llm-toggle", () => ({
  LlmToggleButton: () => <button type="button">AI toggle</button>,
}));

vi.mock("@/components/workspace/session-context-sheet", () => ({
  SessionContextSheet: () => <button type="button">Context</button>,
}));

function HeaderHarness() {
  const { setViewMode, viewMode } = useSessionUiState();

  return (
    <div>
      <div data-testid="view-mode">{viewMode}</div>
      <button type="button" onClick={() => setViewMode("chat")}>
        Set chat
      </button>
      <AppHeader />
    </div>
  );
}

describe("AppHeader", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(buildWorkspaceOnboardingStorageKey("header-user"), "1");
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("uses the main Split control as a reversible toggle", () => {
    render(
      <SessionUiStateProvider sessionId="header-session">
        <HeaderHarness />
      </SessionUiStateProvider>,
    );

    expect(screen.getByTestId("view-mode").textContent).toBe("split");

    fireEvent.click(screen.getByRole("button", { name: "Exit split workspace" }));
    expect(screen.getByTestId("view-mode").textContent).toBe("canvas");

    fireEvent.click(screen.getByRole("button", { name: "Set chat" }));
    expect(screen.getByTestId("view-mode").textContent).toBe("chat");

    fireEvent.click(screen.getByRole("button", { name: "Open split workspace" }));
    expect(screen.getByTestId("view-mode").textContent).toBe("split");

    fireEvent.click(screen.getByRole("button", { name: "Exit split workspace" }));
    expect(screen.getByTestId("view-mode").textContent).toBe("chat");
  });
});
`,
);

create(
  "tests/workspace-onboarding-dialog.test.tsx",
  `// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { WorkspaceOnboardingDialog } from "@/components/workspace/workspace-onboarding-dialog";
import { buildWorkspaceOnboardingStorageKey } from "@/lib/client/workspace-onboarding";

describe("WorkspaceOnboardingDialog", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("stores completion only for the active user", async () => {
    const { rerender } = render(
      <WorkspaceOnboardingDialog onOpenCanvas={() => undefined} userId="user-a" />,
    );

    expect(
      await screen.findByRole("dialog", {
        name: "Turn a question into a structured decision",
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(localStorage.getItem(buildWorkspaceOnboardingStorageKey("user-a"))).toBe("1");

    rerender(
      <WorkspaceOnboardingDialog onOpenCanvas={() => undefined} userId="user-b" />,
    );

    expect(
      await screen.findByRole("dialog", {
        name: "Turn a question into a structured decision",
      }),
    ).toBeTruthy();
    expect(localStorage.getItem(buildWorkspaceOnboardingStorageKey("user-b"))).toBeNull();
  });

  it("opens the split workspace and can be reopened from the help trigger", async () => {
    const onOpenCanvas = vi.fn();
    render(<WorkspaceOnboardingDialog onOpenCanvas={onOpenCanvas} userId="user-a" />);

    await screen.findByRole("dialog", {
      name: "Turn a question into a structured decision",
    });
    fireEvent.click(screen.getByRole("button", { name: "Open split workspace" }));

    expect(onOpenCanvas).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(buildWorkspaceOnboardingStorageKey("user-a"))).toBe("1");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open workspace guide" }));
    expect(
      await screen.findByRole("dialog", {
        name: "Turn a question into a structured decision",
      }),
    ).toBeTruthy();
  });
});
`,
);

console.log("User-scoped workspace onboarding prepared.");
