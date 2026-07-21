export const CODEX_AGENT_DEFAULTS_STORAGE_KEY = "nodes.codex-agent-defaults.v1";

// Current general-purpose / coding models listed for Codex usage.
// Access can still vary by account, plan, workspace policy, or research-preview eligibility.
export const CODEX_MODEL_OPTIONS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2",
] as const;

export const CODEX_TOOL_OPTIONS = ["web", "files", "shell"] as const;

export type CodexAgentTool = (typeof CODEX_TOOL_OPTIONS)[number];
export type CodexAgentModel = (typeof CODEX_MODEL_OPTIONS)[number];

export type CodexAgentDefaults = {
  model: string;
  tools: CodexAgentTool[];
  workspace: "temporary" | "project";
  approvalMode: "ask" | "auto";
};

const configuredDefaultModel = process.env.NEXT_PUBLIC_CODEX_MODEL?.trim();
const fallbackModel =
  configuredDefaultModel && CODEX_MODEL_OPTIONS.includes(configuredDefaultModel as CodexAgentModel)
    ? configuredDefaultModel
    : "gpt-5.5";

export const FALLBACK_CODEX_AGENT_DEFAULTS: CodexAgentDefaults = {
  model: fallbackModel,
  tools: ["web", "files"],
  workspace: "temporary",
  approvalMode: "ask",
};

const isTool = (value: unknown): value is CodexAgentTool =>
  typeof value === "string" && CODEX_TOOL_OPTIONS.includes(value as CodexAgentTool);

const isModel = (value: unknown): value is CodexAgentModel =>
  typeof value === "string" && CODEX_MODEL_OPTIONS.includes(value as CodexAgentModel);

export const normalizeCodexAgentDefaults = (value: unknown): CodexAgentDefaults => {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const tools = Array.isArray(record.tools) ? record.tools.filter(isTool) : [];
  return {
    // This also migrates stale selections such as the old gpt-5.6-sol placeholder.
    model: isModel(record.model) ? record.model : FALLBACK_CODEX_AGENT_DEFAULTS.model,
    tools: tools.length ? tools : FALLBACK_CODEX_AGENT_DEFAULTS.tools,
    workspace: record.workspace === "project" ? "project" : "temporary",
    approvalMode: record.approvalMode === "auto" ? "auto" : "ask",
  };
};

export const readCodexAgentDefaults = (): CodexAgentDefaults => {
  if (typeof window === "undefined") return FALLBACK_CODEX_AGENT_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(CODEX_AGENT_DEFAULTS_STORAGE_KEY);
    return raw ? normalizeCodexAgentDefaults(JSON.parse(raw)) : FALLBACK_CODEX_AGENT_DEFAULTS;
  } catch {
    return FALLBACK_CODEX_AGENT_DEFAULTS;
  }
};

export const writeCodexAgentDefaults = (defaults: CodexAgentDefaults) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    CODEX_AGENT_DEFAULTS_STORAGE_KEY,
    JSON.stringify(normalizeCodexAgentDefaults(defaults)),
  );
  window.dispatchEvent(new CustomEvent("codex-agent-defaults-changed"));
};