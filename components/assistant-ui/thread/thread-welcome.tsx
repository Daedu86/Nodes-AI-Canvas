import { ThreadPrimitive } from "@assistant-ui/react";
import { ArrowDownIcon } from "lucide-react";
import type { FC } from "react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useLlmEnabled } from "@/components/context/llm-enabled";

export const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="absolute -top-8 rounded-full disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcomeSuggestions: FC = () => {
  const { llmEnabled } = useLlmEnabled();
  return (
    <div className="mt-3 flex w-full items-stretch justify-center gap-4">
      <ThreadPrimitive.Suggestion
        className="hover:bg-muted/80 flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border p-3 transition-colors ease-in"
        prompt="Help me explore two possible directions for a product feature."
        method="replace"
        autoSend={llmEnabled}
      >
        <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
          Help me explore two possible directions for a product feature.
        </span>
      </ThreadPrimitive.Suggestion>
      <ThreadPrimitive.Suggestion
        className="hover:bg-muted/80 flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border p-3 transition-colors ease-in"
        prompt="Compare two AI branches and tell me which one is stronger."
        method="replace"
        autoSend={llmEnabled}
      >
        <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
          Compare two AI branches and tell me which one is stronger.
        </span>
      </ThreadPrimitive.Suggestion>
    </div>
  );
};

export const ThreadWelcome: FC = () => {
  return (
    <ThreadPrimitive.Empty>
      <div className="w-full max-w-[var(--thread-max-width)] space-y-6 py-6">
        <div>
          <p className="text-lg font-semibold">How can I help you today?</p>
        </div>
        <ThreadWelcomeSuggestions />
      </div>
    </ThreadPrimitive.Empty>
  );
};
