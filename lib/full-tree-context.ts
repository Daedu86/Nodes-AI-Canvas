export type FullTreeContextMessage = {
  id?: string;
  role: "system" | "user" | "assistant";
  content: string;
};

const MAX_CLIENT_FULL_TREE_CONTEXT_CHARS = 48 * 1024;
const FULL_TREE_CONTEXT_INTRO =
  "The following messages come from the full conversation tree. They may belong to sibling branches, so treat them as reference context rather than one linear dialogue.";
const FULL_TREE_TRUNCATION_MARKER =
  "\n\n[... middle of full tree context truncated before transport ...]\n\n";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFullTreeContextMessage = (value: unknown): value is FullTreeContextMessage =>
  isRecord(value) &&
  (value.role === "system" || value.role === "user" || value.role === "assistant") &&
  typeof value.content === "string" &&
  (value.id === undefined || typeof value.id === "string");

const clampFullTreeContext = (value: string) => {
  if (value.length <= MAX_CLIENT_FULL_TREE_CONTEXT_CHARS) return value;

  const availableChars =
    MAX_CLIENT_FULL_TREE_CONTEXT_CHARS - FULL_TREE_TRUNCATION_MARKER.length;
  const headChars = Math.floor(availableChars / 3);
  const tailChars = availableChars - headChars;
  return `${value.slice(0, headChars)}${FULL_TREE_TRUNCATION_MARKER}${value.slice(-tailChars)}`;
};

const isPackedFullTreeContext = (messages: FullTreeContextMessage[]) =>
  messages.length === 2 &&
  messages[0]?.role === "system" &&
  messages[0].content.startsWith(FULL_TREE_CONTEXT_INTRO) &&
  messages[1]?.role === "user";

/**
 * Packs a non-linear Full tree transcript into a provider-safe reference block
 * before it is placed in Assistant UI runConfig. This keeps the runtime and
 * transport payload bounded while preserving the current prompt as the final
 * user message.
 */
export const packFullTreeContextMessages = (
  messages: FullTreeContextMessage[],
): FullTreeContextMessage[] => {
  if (messages.length <= 1 || isPackedFullTreeContext(messages)) return messages;

  const currentPrompt = messages.at(-1);
  if (!currentPrompt) return messages;

  const treeTranscript = messages
    .slice(0, -1)
    .map((message, index) => {
      const idSuffix = message.id ? ` | id=${message.id}` : "";
      return `[Tree node ${index + 1} | role=${message.role}${idSuffix}]\n${message.content}`;
    })
    .join("\n\n");

  if (!treeTranscript.trim()) return [currentPrompt];

  return [
    {
      role: "system",
      content: clampFullTreeContext(
        `${FULL_TREE_CONTEXT_INTRO}\n\n${treeTranscript}`,
      ),
    },
    currentPrompt,
  ];
};

const compactModelResolutionTreeContext = (value: unknown) => {
  if (!isRecord(value)) return value;
  const custom = isRecord(value.custom) ? value.custom : null;
  if (custom?.contextScope !== "tree" || !Array.isArray(custom.contextMessages)) {
    return value;
  }

  const contextMessages = custom.contextMessages.filter(isFullTreeContextMessage);
  if (contextMessages.length === 0) return value;

  return {
    ...value,
    custom: {
      ...custom,
      contextMessages: packFullTreeContextMessages(contextMessages),
    },
  };
};

/**
 * Final transport guard used by the AI SDK request adapter. It compacts Full
 * tree context regardless of whether Assistant UI placed it in runConfig or
 * metadata, preventing a large tree from stalling client-side serialization.
 */
export const compactFullTreeRequestBody = (
  body: Record<string, unknown>,
): Record<string, unknown> => ({
  ...body,
  ...(body.runConfig !== undefined
    ? { runConfig: compactModelResolutionTreeContext(body.runConfig) }
    : {}),
  ...(body.metadata !== undefined
    ? { metadata: compactModelResolutionTreeContext(body.metadata) }
    : {}),
});
