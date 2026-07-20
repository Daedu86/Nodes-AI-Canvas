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

const clampFullTreeContext = (value: string) => {
  if (value.length <= MAX_CLIENT_FULL_TREE_CONTEXT_CHARS) return value;

  const availableChars =
    MAX_CLIENT_FULL_TREE_CONTEXT_CHARS - FULL_TREE_TRUNCATION_MARKER.length;
  const headChars = Math.floor(availableChars / 3);
  const tailChars = availableChars - headChars;
  return `${value.slice(0, headChars)}${FULL_TREE_TRUNCATION_MARKER}${value.slice(-tailChars)}`;
};

/**
 * Packs a non-linear Full tree transcript into a provider-safe reference block
 * before it is placed in Assistant UI runConfig. This keeps the runtime and
 * transport payload bounded while preserving the current prompt as the final
 * user message.
 */
export const packFullTreeContextMessages = (
  messages: FullTreeContextMessage[],
): FullTreeContextMessage[] => {
  if (messages.length <= 1) return messages;

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
