import {
  ComposerPrimitive,
  ThreadPrimitive,
  useAssistantRuntime,
  useComposerRuntime,
  useThread,
} from "@assistant-ui/react";
import type { FC } from "react";
import React from "react";
import { ImagePlus, SendHorizontalIcon, X } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useLlmEnabled } from "@/components/context/llm-enabled";
import { useModelConfig } from "@/components/context/model-config";
import { useRequestError } from "@/components/context/request-error";
import { Button } from "@/components/ui/button";
import { isVisionCapableModel } from "@/lib/llm/provider-catalog";

type ChatContextScope = "parent" | "branch" | "tree";

type ScopedContextMessage = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type ExportedThreadEntry = {
  parentId: string | null;
  message: {
    id: string;
    role: string;
    content: unknown;
  };
};

type ExportedThreadSnapshot = {
  headId?: string | null;
  messages: ExportedThreadEntry[];
};

const ASSISTANT_FIRST_PARENT_CONTEXT =
  "Continue from the saved assistant response below; treat it as conversation context.";

const getExportedMessageText = (message: ExportedThreadEntry["message"]) => {
  if (typeof message.content === "string") return message.content.trim();
  if (!Array.isArray(message.content)) return "";
  return message.content
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const record = part as { type?: unknown; text?: unknown };
      return record.type === "text" && typeof record.text === "string"
        ? [record.text]
        : [];
    })
    .join("\n")
    .trim();
};

const buildChatContextMessages = (
  snapshot: ExportedThreadSnapshot,
  scope: ChatContextScope,
  promptText: string,
): ScopedContextMessage[] => {
  const entries = snapshot.messages.filter(
    (entry) =>
      !entry.message.id.startsWith("__error__") &&
      (entry.message.role === "user" || entry.message.role === "assistant"),
  );
  const byId = new Map(entries.map((entry) => [entry.message.id, entry] as const));
  const toMessage = (entry: ExportedThreadEntry | undefined): ScopedContextMessage | null => {
    if (!entry) return null;
    const content = getExportedMessageText(entry.message);
    if (!content) return null;
    return {
      id: entry.message.id,
      role: entry.message.role as "user" | "assistant",
      content,
    };
  };
  const headEntry = snapshot.headId
    ? byId.get(snapshot.headId)
    : entries.at(-1);
  let history: ScopedContextMessage[] = [];

  if (scope === "parent") {
    const parentMessage = toMessage(headEntry);
    history = parentMessage
      ? parentMessage.role === "assistant"
        ? [
            { role: "user", content: ASSISTANT_FIRST_PARENT_CONTEXT },
            parentMessage,
          ]
        : [parentMessage]
      : [];
  } else if (scope === "branch") {
    const lineage: ExportedThreadEntry[] = [];
    const visited = new Set<string>();
    let current = headEntry;
    while (current && !visited.has(current.message.id)) {
      visited.add(current.message.id);
      lineage.push(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    history = lineage.reverse().flatMap((entry) => {
      const message = toMessage(entry);
      return message ? [message] : [];
    });
  } else {
    history = entries.flatMap((entry) => {
      const message = toMessage(entry);
      return message ? [message] : [];
    });
  }

  return [
    ...history,
    { role: "user" as const, content: promptText.trim() },
  ].filter((message) => message.content.length > 0);
};

const applyComposerRunConfig = (
  composer: ReturnType<typeof useComposerRuntime>,
  contextScope: ChatContextScope,
  modelId: string,
  provider: string,
  contextMessages?: ScopedContextMessage[],
) => {
  if (!composer) return;
  const historyMode = contextScope === "parent" ? "last" : "full";
  try {
    composer.setRunConfig({
      custom: {
        contextScope,
        ...(contextMessages ? { contextMessages } : {}),
        historyMode,
        model: modelId,
        provider,
      },
    });
  } catch {
    // Runtime may be unavailable during initialization.
  }
};

const ACTIVE_RUN_ERROR_MESSAGE =
  "The assistant is still responding. Wait for it to finish or cancel the current run.";

const ContextScopeControls: FC<{
  contextScope: ChatContextScope;
  setContextScope: (value: ChatContextScope) => void;
  className?: string;
}> = ({ contextScope, setContextScope, className }) => {
  return (
    <label className={className ?? "flex items-center gap-2 text-xs"}>
      <span className="text-muted-foreground">Context:</span>
      <select
        value={contextScope}
        onChange={(event) => setContextScope(event.target.value as ChatContextScope)}
        className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
      >
        <option value="parent">Parent message</option>
        <option value="branch">Branch lineage</option>
        <option value="tree">Full tree</option>
      </select>
    </label>
  );
};

const ComposerAction: FC<{
  onSend: () => void;
  onCancel: () => void;
  disableSend?: boolean;
}> = ({ onSend, onCancel, disableSend }) => {
  const { llmEnabled } = useLlmEnabled();
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <TooltipIconButton
          tooltip="Send"
          variant="default"
          type="button"
          disabled={!llmEnabled || Boolean(disableSend)}
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
          type="button"
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
  const runtime = useAssistantRuntime();
  const composer = useComposerRuntime();
  const isRunning = useThread((state) => state.isRunning);
  const [contextScope, setContextScope] = React.useState<ChatContextScope>("parent");
  const { llmEnabled } = useLlmEnabled();
  const { modelId, provider } = useModelConfig();
  const { clearRequestError, requestError, setRequestError } = useRequestError();
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);
  const [pendingImages, setPendingImages] = React.useState<
    Array<{
      id: string;
      dataUrl: string;
      filename: string;
      byteSize: number;
      mediaType: string;
    }>
  >([]);
  const [isPreparingImages, setIsPreparingImages] = React.useState(false);

  const addImagesFromFiles = React.useCallback(
    async (files: File[]) => {
      const entries = [...files];
      const isLikelyImage = (file: File) =>
        file.type.startsWith("image/") ||
        /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic)$/i.test(file.name);
      const imageFiles = entries.filter(isLikelyImage);
      if (imageFiles.length === 0) return;

      // Keep payloads small to avoid request bloat and provider limits.
      const MAX_IMAGE_BYTES = 1_800_000;
      const validFiles = imageFiles.filter((file) => file.size <= MAX_IMAGE_BYTES);
      const rejected = imageFiles.filter((file) => file.size > MAX_IMAGE_BYTES);
      if (rejected.length > 0) {
        setRequestError(
          `Image too large (max ${(MAX_IMAGE_BYTES / 1_000_000).toFixed(1)}MB). Try a smaller image.`,
        );
      }
      if (validFiles.length === 0) {
        return;
      }

      const readAsDataUrl = (file: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("Failed to read image"));
          reader.readAsDataURL(file);
        });

      try {
        setIsPreparingImages(true);
        clearRequestError();
        const next = await Promise.all(
          validFiles.map(async (file) => ({
            id: crypto.randomUUID(),
            dataUrl: await readAsDataUrl(file),
            filename: file.name,
            byteSize: file.size,
            mediaType: file.type || "image/png",
          })),
        );
        setPendingImages((current) => [...current, ...next].slice(0, 6));
      } catch (error) {
        console.error("Failed to add image attachment", error);
        setRequestError("Could not attach image. Try again.");
      } finally {
        setIsPreparingImages(false);
      }
    },
    [clearRequestError, setRequestError],
  );

  const handleSend = React.useCallback(() => {
    void (async () => {
      if (!composer || !runtime || !llmEnabled) return;
      if (isRunning) {
        setRequestError(ACTIVE_RUN_ERROR_MESSAGE);
        return;
      }
      const state = composer.getState();
      const text = state.text.trim();
      if (!text && pendingImages.length === 0) return;

      if (isPreparingImages) {
        setRequestError("Still preparing the image attachment. Please wait a moment and try again.");
        return;
      }

      if (pendingImages.length > 0 && !isVisionCapableModel(provider, modelId)) {
        setRequestError(
          "This model is text-only. Switch to a vision-capable model (e.g. OpenRouter/free, Gemma 4, or Nemotron Nano VL) to describe images.",
        );
        return;
      }
      clearRequestError();

      try {
        // Use assistant-ui's attachment pipeline so the AI SDK runtime can serialize the request
        // as UIMessage FileUIParts (which our backend converts into model image parts).
        const derivedText = text || (pendingImages.length > 0 ? "Describe the attached image." : "");
        const contextMessages =
          pendingImages.length === 0
            ? buildChatContextMessages(
                runtime.threads.main.export() as unknown as ExportedThreadSnapshot,
                contextScope,
                derivedText,
              )
            : undefined;
        applyComposerRunConfig(
          composer,
          contextScope,
          modelId,
          provider,
          contextMessages,
        );

        // Ensure the draft includes something when users send "image-only".
        if (!text && derivedText) {
          composer.setText(derivedText);
        }

        if (pendingImages.length > 0) {
          await composer.clearAttachments();
          for (const image of pendingImages) {
            await composer.addAttachment({
              type: "image",
              name: image.filename,
              contentType: image.mediaType,
              content: [
                {
                  type: "image",
                  image: image.dataUrl,
                  filename: image.filename,
                },
              ],
            });
          }
        }

        composer.send({ startRun: true });

        // Ensure newly-sent messages are visible even when the thread viewport virtualizes items.
        // (ThreadPrimitive.Viewport autoScroll can be conservative when the user isn't pinned to bottom.)
        requestAnimationFrame(() => {
          const viewport = document.querySelector<HTMLElement>('[data-testid="thread-viewport"]');
          if (!viewport) return;
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
        });

        // Clear the composer draft (best-effort; internal API varies across assistant-ui versions).
        try {
          (composer as unknown as { setText?: (value: string) => void }).setText?.("");
        } catch {
          // ignore clear failures
        }
        // Clear attachments after send; do it async to avoid racing send() in runtimes that snapshot late.
        queueMicrotask(() => {
          void composer.clearAttachments();
        });
        setPendingImages([]);
        if (imageInputRef.current) {
          imageInputRef.current.value = "";
        }
      } catch (error) {
        console.error("Failed to append message to thread runtime", error);
        setRequestError(
          "Could not send that message. If you attached an image, try a smaller image or switch to a vision-capable model.",
        );
      }
    })();
  }, [
    clearRequestError,
    composer,
    contextScope,
    isRunning,
    isPreparingImages,
    llmEnabled,
    modelId,
    pendingImages,
    provider,
    runtime,
    setRequestError,
  ]);

  const handleCancel = React.useCallback(() => {
    if (!composer) return;
    composer.cancel();
  }, [composer]);

  return (
    <ComposerPrimitive.Root className="focus-within:border-ring/20 flex w-full flex-wrap items-end rounded-lg border bg-inherit px-2.5 shadow-sm transition-colors ease-in">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        data-testid="chat-image-input"
        className="hidden"
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : [];
          event.target.value = "";
          if (files.length === 0) return;
          void addImagesFromFiles(files);
        }}
      />
      {pendingImages.length > 0 ? (
        <div data-testid="composer-image-preview" className="w-full px-2 pb-2 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {pendingImages.map((image) => (
              <div
                key={image.id}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-background/70 shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.dataUrl}
                  alt={image.filename}
                  className="block h-16 w-24 object-cover"
                />
                <button
                  type="button"
                  className="absolute right-1 top-1 inline-flex items-center justify-center rounded-full border border-border/60 bg-background/85 p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100"
                  onClick={() =>
                    setPendingImages((current) => current.filter((entry) => entry.id !== image.id))
                  }
                  aria-label="Remove image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            Image input depends on the selected model/provider. Some free models are text-only and may ignore images or return an error.
          </p>
        </div>
      ) : null}
      <div className="flex w-full items-end gap-2">
        <TooltipIconButton
          tooltip="Attach image"
          variant="ghost"
          type="button"
          disabled={!llmEnabled || isPreparingImages}
          onClick={() => imageInputRef.current?.click()}
          className="my-2.5 size-8 p-2 text-muted-foreground hover:text-foreground"
        >
          <ImagePlus className="h-4 w-4" />
        </TooltipIconButton>
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder="Write a message..."
          disabled={!llmEnabled}
          onPaste={(event) => {
            const items = Array.from(event.clipboardData?.items ?? []);
            const files = items
              .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
              .map((item) => item.getAsFile())
              .filter((file): file is File => Boolean(file));
            if (files.length === 0) return;
            event.preventDefault();
            void addImagesFromFiles(files);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          className="placeholder:text-muted-foreground max-h-40 flex-grow resize-none border-none bg-transparent px-2 py-4 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed"
        />
        <ComposerAction onSend={handleSend} onCancel={handleCancel} disableSend={isPreparingImages} />
      </div>
      <ContextScopeControls
        contextScope={contextScope}
        setContextScope={setContextScope}
        className="mt-1 flex items-center gap-2 text-xs"
      />
      {!llmEnabled ? (
        <div className="px-2 pb-2 text-xs text-amber-700 dark:text-amber-300">
          AI requests are disabled. Turn on the `AI on/off` control in the header to send
          messages.
        </div>
      ) : null}
      {requestError ? (
        <div
          role="alert"
          data-testid="composer-error"
          className="px-2 pb-2 text-xs text-red-700 dark:text-red-300"
        >
          {requestError}
        </div>
      ) : null}
    </ComposerPrimitive.Root>
  );
};

export const EditComposer: FC = () => {
  const runtime = useAssistantRuntime();
  const composer = useComposerRuntime();
  const isRunning = useThread((state) => state.isRunning);
  const [contextScope, setContextScope] = React.useState<ChatContextScope>("parent");
  const { llmEnabled } = useLlmEnabled();
  const { modelId, provider } = useModelConfig();
  const { clearRequestError, requestError, setRequestError } = useRequestError();

  const handleSend = () => {
    if (!composer || !runtime || !llmEnabled) return;
    if (isRunning) {
      setRequestError(ACTIVE_RUN_ERROR_MESSAGE);
      return;
    }
    const state = composer.getState();
    const text = state.text.trim();
    if (!text) return;
    const contextMessages = buildChatContextMessages(
      runtime.threads.main.export() as unknown as ExportedThreadSnapshot,
      contextScope,
      text,
    );
    applyComposerRunConfig(
      composer,
      contextScope,
      modelId,
      provider,
      contextMessages,
    );
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
        <ContextScopeControls
          contextScope={contextScope}
          setContextScope={setContextScope}
          className="mr-auto flex items-center gap-2 text-xs"
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
