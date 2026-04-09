export const LLM_PROVIDER_IDS = [
  "openrouter",
  "ollama",
  "openai",
  "anthropic",
  "google",
] as const;

export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

export type ProviderDefinition = {
  connectionHint: string;
  description: string;
  label: string;
  modelHint: string;
  settingsLabel: string;
};

export type ProviderModelOption = {
  label: string;
  modelId: string;
  provider: LlmProviderId;
};

export const OPENROUTER_FREE_MODEL_OPTIONS: ProviderModelOption[] = [
  {
    label: "OpenRouter · Nemotron 3 Super (free)",
    modelId: "nvidia/nemotron-3-super-120b-a12b:free",
    provider: "openrouter",
  },
  {
    label: "OpenRouter · Free Router",
    modelId: "openrouter/free",
    provider: "openrouter",
  },
  {
    label: "OpenRouter · Nemotron 3 Nano",
    modelId: "nvidia/nemotron-3-nano-30b-a3b:free",
    provider: "openrouter",
  },
  {
    label: "OpenRouter · Trinity Large Preview",
    modelId: "arcee-ai/trinity-large-preview:free",
    provider: "openrouter",
  },
  {
    label: "OpenRouter · Trinity Mini",
    modelId: "arcee-ai/trinity-mini:free",
    provider: "openrouter",
  },
];

export const DEFAULT_OLLAMA_MODELS = ["gemma3:4b"];

export const SAFE_DEFAULT_MODEL = OPENROUTER_FREE_MODEL_OPTIONS[0]!;

export const PROVIDER_DEFINITIONS: Record<LlmProviderId, ProviderDefinition> = {
  anthropic: {
    connectionHint: "Add your Anthropic key and the Claude models you want exposed.",
    description: "Claude API via Anthropic.",
    label: "Anthropic",
    modelHint: "claude-opus-4-1, claude-sonnet-4",
    settingsLabel: "API key",
  },
  google: {
    connectionHint: "Add your Gemini key and the Gemini models you want exposed.",
    description: "Gemini API via Google Generative AI.",
    label: "Gemini",
    modelHint: "gemini-2.5-flash, gemini-2.5-pro",
    settingsLabel: "API key",
  },
  ollama: {
    connectionHint: "Local models served by Ollama.",
    description: "Local or remote Ollama runtime.",
    label: "Ollama",
    modelHint: "gemma3:4b, llama3.2:3b",
    settingsLabel: "Base URL",
  },
  openai: {
    connectionHint: "Add your OpenAI key and the OpenAI models you want exposed.",
    description: "OpenAI API.",
    label: "OpenAI",
    modelHint: "gpt-5-mini, gpt-4.1-mini",
    settingsLabel: "API key",
  },
  openrouter: {
    connectionHint: "Free OpenRouter pool already wired into Nodes.",
    description: "Cloud router with five free models.",
    label: "OpenRouter",
    modelHint: OPENROUTER_FREE_MODEL_OPTIONS.map((option) => option.modelId).join(", "),
    settingsLabel: "Optional API key override",
  },
};

const MODEL_LABEL_LOOKUP = new Map(
  [...OPENROUTER_FREE_MODEL_OPTIONS].map((option) => [
    `${option.provider}:${option.modelId}`,
    option.label,
  ]),
);

MODEL_LABEL_LOOKUP.set("ollama:gemma3:4b", "Ollama · gemma3:4b (local optional)");

export function getProviderLabel(provider?: string | null) {
  if (!provider) return "Model";
  const definition = PROVIDER_DEFINITIONS[provider as LlmProviderId];
  if (definition) return definition.label;
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function getProviderDefinition(provider: LlmProviderId) {
  return PROVIDER_DEFINITIONS[provider];
}

export function normalizeEditableModelList(value?: string[] | string | null) {
  const entries =
    typeof value === "string"
      ? value.split(/[\n,]+/g)
      : Array.isArray(value)
        ? value
        : [];

  return [...new Set(entries.map((entry) => entry.trim()).filter(Boolean))];
}

export function getBuiltinModelLabel(provider: string, modelId: string) {
  return MODEL_LABEL_LOOKUP.get(`${provider}:${modelId}`);
}

export function createProviderModelLabel(provider: string, modelId: string) {
  const builtin = getBuiltinModelLabel(provider, modelId);
  if (builtin) return builtin;
  return `${getProviderLabel(provider)} · ${modelId}`;
}
