export const CODEX_AGENT_DEFAULTS_STORAGE_KEY = "nodes.codex-agent-defaults.v1";

export const CODEX_MODEL_OPTIONS = [
  "gpt-5.6-sol",
  "gpt-5.6",
  "o4-mini",
] as const;

export const CODEX_TOOL_OPTIONS = ["web", "files", "shell"] as const;

export type CodexAgentTool = (typeof CODEX_TOOL_OPTIONS)[number];

export type CodexAgentDefaults = {
  model: string;
  tools: CodexAgentTool[];
  workspace: "temporary" | "project";
  approvalMode: "ask" | "auto";
};

export const FALLBACK_CODEX_AGENT_DEFAULTS: CodexAgentDefaults = {
  model: process.env.NEXT_PUBLIC_CODEX_MODEL?.trim() || "gpt-5.6-sol",
  tools: ["web", "files"],
  workspace: "temporary",
  approvalMode: "ask",
};

const isTool = (value: unknown): value is CodexAgentTool =>
  typeof value === "string" && CODEX_TOOL_OPTIONS.includes(value as CodexAgentTool);

export const normalizeCodexAgentDefaults = (value: unknown): CodexAgentDefaults => {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const tools = Array.isArray(record.tools) ? record.tools.filter(isTool) : [];
  return {
    model:
      typeof record.model === "string" && record.model.trim()
        ? record.model.trim().slice(0, 120)
        : FALLBACK_CODEX_AGENT_DEFAULTS.model,
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