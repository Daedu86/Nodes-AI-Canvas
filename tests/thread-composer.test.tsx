// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const composerRuntimeMock = vi.hoisted(() => ({
  cancel: vi.fn(),
  clearAttachments: vi.fn(() => Promise.resolve()),
  addAttachment: vi.fn(() => Promise.resolve()),
  getState: vi.fn(),
  send: vi.fn(),
  setRunConfig: vi.fn(),
  setText: vi.fn(),
}));

const assistantRuntimeMock = vi.hoisted(() => ({
  threads: {
    main: {
      append: vi.fn(),
    },
  },
}));

const historyModeState = vi.hoisted(() => ({
  historyMode: "last",
  setHistoryMode: vi.fn(),
}));

const llmState = vi.hoisted(() => ({
  llmEnabled: true,
}));

const threadState = vi.hoisted(() => ({
  isRunning: false,
}));

const modelConfigState = vi.hoisted(() => ({
  modelId: "nvidia/nemotron-3-super-120b-a12b:free",
  provider: "openrouter",
}));

const requestErrorState = vi.hoisted(() => ({
  clearRequestError: vi.fn(),
  requestError: null as string | null,
  setRequestError: vi.fn(),
}));

vi.mock("@assistant-ui/react", async () => {
  const ReactModule = await import("react");
  const Input = ReactModule.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
    (props, ref) => <textarea ref={ref} {...props} />,
  );
  Input.displayName = "MockComposerInput";

  const If = ({
    children,
    running,
  }: {
    children: React.ReactNode;
    running?: boolean;
  }) => {
    if (typeof running === "boolean") {
      return running === threadState.isRunning ? <>{children}</> : null;
    }
    return <>{children}</>;
  };

  return {
    ActionBarPrimitive: {
      Copy: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Edit: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Reload: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    },
    BranchPickerPrimitive: {
      Count: () => <span>1</span>,
      Next: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Number: () => <span>1</span>,
      Previous: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    },
    ComposerPrimitive: {
      Input,
      Root: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
    },
    MessagePrimitive: {
      Content: () => null,
      If: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    },
    ThreadPrimitive: {
      Empty: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      If,
      Messages: () => null,
      Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      ScrollToBottom: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Suggestion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Viewport: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    },
    useAssistantRuntime: vi.fn(() => assistantRuntimeMock),
    useComposerRuntime: vi.fn(() => composerRuntimeMock),
    useMessage: vi.fn(() => null),
    useThread: vi.fn((selector?: (state: { isRunning: boolean }) => unknown) =>
      selector ? selector(threadState) : threadState,
    ),
  };
});

vi.mock("@/components/assistant-ui/markdown-text", () => ({
  MarkdownText: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/assistant-ui/tool-fallback", () => ({
  ToolFallback: () => null,
}));

vi.mock("@/components/assistant-ui/tooltip-icon-button", async () => {
  const ReactModule = await import("react");
  const Button = ReactModule.forwardRef<HTMLButtonElement, React.ComponentProps<"button"> & {
    tooltip?: string;
  }>(({ children, tooltip, ...props }, ref) => (
    <button ref={ref} aria-label={tooltip} type="button" {...props}>
      {children}
    </button>
  ));
  Button.displayName = "MockTooltipIconButton";
  return {
    TooltipIconButton: Button,
  };
});

vi.mock("@/components/context/history-mode", () => ({
  useHistoryMode: () => historyModeState,
}));

vi.mock("@/components/context/llm-enabled", () => ({
  useLlmEnabled: () => llmState,
}));

vi.mock("@/components/context/model-config", () => ({
  useModelConfig: () => modelConfigState,
}));

vi.mock("@/components/context/request-error", () => ({
  useRequestError: () => requestErrorState,
}));

vi.mock("@/components/context/link-editor", () => ({
  useLinkEditor: () => ({
    getParentId: (_childId?: string | null, fallback?: string | null) => fallback ?? null,
  }),
}));

vi.mock("@/components/ui/button", async () => {
  const ReactModule = await import("react");
  const Button = ReactModule.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(
    ({ children, ...props }, ref) => (
      <button ref={ref} type="button" {...props}>
        {children}
      </button>
    ),
  );
  Button.displayName = "MockButton";
  return {
    Button,
  };
});

import { Composer } from "../components/assistant-ui/thread";

describe("Composer", () => {
  beforeEach(() => {
    historyModeState.historyMode = "last";
    llmState.llmEnabled = true;
    threadState.isRunning = false;
    composerRuntimeMock.cancel.mockReset();
    composerRuntimeMock.clearAttachments.mockReset();
    composerRuntimeMock.addAttachment.mockReset();
    composerRuntimeMock.getState.mockReset();
    composerRuntimeMock.send.mockReset();
    composerRuntimeMock.setRunConfig.mockReset();
    composerRuntimeMock.setText.mockReset();
    assistantRuntimeMock.threads.main.append.mockReset();
    requestErrorState.clearRequestError.mockReset();
    requestErrorState.requestError = null;
    requestErrorState.setRequestError.mockReset();
    composerRuntimeMock.getState.mockReturnValue({ text: "Hola" });
  });

  afterEach(() => {
    cleanup();
  });

  it("sets run config and sends when the send button is clicked", async () => {
    render(<Composer />);

    expect(composerRuntimeMock.setRunConfig).toHaveBeenCalledWith({
      custom: {
        historyMode: "last",
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        provider: "openrouter",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(requestErrorState.clearRequestError).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(composerRuntimeMock.send).toHaveBeenCalledWith({ startRun: true }),
    );
  });

  it("sends on Enter and ignores Shift+Enter", async () => {
    render(<Composer />);

    const input = screen.getByPlaceholderText("Write a message...");

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(composerRuntimeMock.send).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    await waitFor(() =>
      expect(composerRuntimeMock.send).toHaveBeenCalledWith({ startRun: true }),
    );
  });

  it("blocks submit and shows the disabled warning when AI is off", () => {
    llmState.llmEnabled = false;
    render(<Composer />);

    expect(
      screen.getByText(/AI requests are disabled\. Turn on the `AI on\/off` control/i),
    ).toBeTruthy();

    const sendButton = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);

    fireEvent.click(sendButton);
    expect(composerRuntimeMock.send).not.toHaveBeenCalled();
  });

  it("blocks duplicate sends while a run is already active", () => {
    threadState.isRunning = true;
    render(<Composer />);

    const input = screen.getByPlaceholderText("Write a message...");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    expect(composerRuntimeMock.send).not.toHaveBeenCalled();
    expect(requestErrorState.setRequestError).toHaveBeenCalledWith(
      "The assistant is still responding. Wait for it to finish or cancel the current run.",
    );
  });
});
