import {
  ComposerPrimitive,
  ThreadPrimitive,
  useComposerRuntime,
  useThread,
} from "@assistant-ui/react";
import type { FC } from "react";
import React from "react";
import { SendHorizontalIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useHistoryMode } from "@/components/context/history-mode";
import { useLlmEnabled } from "@/components/context/llm-enabled";
import { useModelConfig } from "@/components/context/model-config";
import { useRequestError } from "@/components/context/request-error";
import { Button } from "@/components/ui/button";

const applyComposerRunConfig = (
  composer: ReturnType<typeof useComposerRuntime>,
  historyMode: "last" | "full",
  modelId: string,
  provider: string,
) => {
  if (!composer) return;
  try {
    composer.setRunConfig({ custom: { historyMode, model: modelId, provider } });
  } catch {
    // Runtime may be unavailable during initialization.
  }
};

const ACTIVE_RUN_ERROR_MESSAGE =
  "The assistant is still responding. Wait for it to finish or cancel the current run.";

const HistoryModeControls: FC<{
  historyMode: "last" | "full";
  setHistoryMode: (value: "last" | "full") => void;
  className?: string;
}> = ({ historyMode, setHistoryMode, className }) => {
  return (
    <div className={className ?? "flex items-center gap-1 text-xs"}>
      <span className="text-muted-foreground">History:</span>
      <Button
        type="button"
        variant={historyMode === "last" ? "default" : "outline"}
        size="sm"
        onClick={() => setHistoryMode("last")}
      >
        Last
      </Button>
      <Button
        type="button"
        variant={historyMode === "full" ? "default" : "outline"}
        size="sm"
        onClick={() => setHistoryMode("full")}
      >
        Full
      </Button>
    </div>
  );
};

const ComposerAction: FC<{ onSend: () => void; onCancel: () => void }> = ({
  onSend,
  onCancel,
}) => {
  const { llmEnabled } = useLlmEnabled();
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <TooltipIconButton
          tooltip="Send"
          variant="default"
          disabled={!llmEnabled}
          onClick={onSend}
          className="my-2.5 size-8 p-2 transition-opacity ease-in"
        >
          <SendHorizontalIcon />
        </TooltipIconButton>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <TooltipIconButton
          tooltip="Cancel"
          variant="default"
          disabled={!llmEnabled}
          onClick={onCancel}
          className="my-2.5 size-8 p-2 transition-opacity ease-in"
        >
          <CircleStopIcon />
        </TooltipIconButton>
      </ThreadPrimitive.If>
    </>
  );
};

export const Composer: FC = () => {
  const composer = useComposerRuntime();
  const isRunning = useThread((state) => state.isRunning);
  const { historyMode, setHistoryMode } = useHistoryMode();
  const { llmEnabled } = useLlmEnabled();
  const { modelId, provider } = useModelConfig();
  const { clearRequestError, requestError, setRequestError } = useRequestError();

  React.useEffect(() => {
    applyComposerRunConfig(composer, historyMode, modelId, provider);
  }, [composer, historyMode, modelId, provider]);

  const handleSend = React.useCallback(() => {
    if (!composer || !llmEnabled) return;
    if (isRunning) {
      setRequestError(ACTIVE_RUN_ERROR_MESSAGE);
      return;
    }
    const state = composer.getState();
    const text = state.text.trim();
    if (!text) return;
    clearRequestError();
    composer.send();
  }, [clearRequestError, composer, isRunning, llmEnabled, setRequestError]);

  const handleCancel = React.useCallback(() => {
    if (!composer) return;
    composer.cancel();
  }, [composer]);

  return (
    <ComposerPrimitive.Root className="focus-within:border-ring/20 flex w-full flex-wrap items-end rounded-lg border bg-inherit px-2.5 shadow-sm transition-colors ease-in">
      <div className="flex w-full items-end gap-2">
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder="Write a message..."
          disabled={!llmEnabled}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          className="placeholder:text-muted-foreground max-h-40 flex-grow resize-none border-none bg-transparent px-2 py-4 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed"
        />
        <ComposerAction onSend={handleSend} onCancel={handleCancel} />
      </div>
      <HistoryModeControls
        historyMode={historyMode}
        setHistoryMode={setHistoryMode}
        className="mt-1 flex items-center gap-1 text-xs"
      />
      {!llmEnabled ? (
        <div className="px-2 pb-2 text-xs text-amber-700 dark:text-amber-300">
          AI requests are disabled. Turn on the `AI on/off` control in the header to send
          messages.
        </div>
      ) : null}
      {requestError ? (
        <div role="alert" className="px-2 pb-2 text-xs text-red-700 dark:text-red-300">
          {requestError}
        </div>
      ) : null}
    </ComposerPrimitive.Root>
  );
};

export const EditComposer: FC = () => {
  const composer = useComposerRuntime();
  const isRunning = useThread((state) => state.isRunning);
  const { historyMode, setHistoryMode } = useHistoryMode();
  const { llmEnabled } = useLlmEnabled();
  const { modelId, provider } = useModelConfig();
  const { clearRequestError, requestError, setRequestError } = useRequestError();

  const handleSend = () => {
    if (!composer || !llmEnabled) return;
    if (isRunning) {
      setRequestError(ACTIVE_RUN_ERROR_MESSAGE);
      return;
    }
    const state = composer.getState();
    const text = state.text.trim();
    if (!text) return;
    applyComposerRunConfig(composer, historyMode, modelId, provider);
    clearRequestError();
    composer.send({ startRun: true });
  };

  const handleCancel = () => {
    if (!composer) return;
    composer.cancel();
  };

  return (
    <ComposerPrimitive.Root className="bg-muted my-4 flex w-full max-w-[var(--thread-max-width)] flex-col gap-2 rounded-xl">
      <ComposerPrimitive.Input
        className="text-foreground flex h-8 w-full resize-none bg-transparent p-4 pb-0 outline-none"
        disabled={!llmEnabled}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSend();
          }
        }}
      />
      <div className="mx-3 mb-3 flex items-center justify-end gap-2">
        <HistoryModeControls
          historyMode={historyMode}
          setHistoryMode={setHistoryMode}
          className="mr-auto flex items-center gap-1 text-xs"
        />
        <Button type="button" variant="ghost" onClick={handleCancel} disabled={!llmEnabled}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSend} disabled={!llmEnabled || isRunning}>
          Send
        </Button>
      </div>
      {requestError ? (
        <div role="alert" className="px-3 pb-3 text-xs text-red-700 dark:text-red-300">
          {requestError}
        </div>
      ) : null}
    </ComposerPrimitive.Root>
  );
};

const CircleStopIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      width="16"
      height="16"
    >
      <rect width="10" height="10" x="3" y="3" rx="2" />
    </svg>
  );
};
