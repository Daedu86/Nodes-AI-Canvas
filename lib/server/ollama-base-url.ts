import { normalizeOllamaBaseUrl } from "@/lib/llm/user-settings";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const getEnvFlag = (value: string | undefined) => value === "1";

const normalizeHostname = (value: string) => value.trim().replace(/^\[|\]$/g, "").toLowerCase();

const getAllowedOllamaHostnames = () => {
  const raw = process.env.OLLAMA_ALLOWED_HOSTNAMES ?? "";
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map(normalizeHostname);
  return new Set(entries);
};

export type OllamaBaseUrlValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; error: string };

export function validateOllamaBaseUrl(input: string): OllamaBaseUrlValidationResult {
  const normalized = normalizeOllamaBaseUrl(input);
  if (!normalized.ok) return normalized;

  const url = new URL(normalized.normalized);
  const hostname = normalizeHostname(url.hostname);

  const allowRemote = getEnvFlag(process.env.ALLOW_OLLAMA_REMOTE_HOSTS);
  const allowedHostnames = getAllowedOllamaHostnames();

  if (!LOOPBACK_HOSTNAMES.has(hostname)) {
    if (!allowRemote) {
      return { ok: false, error: "Only localhost Ollama endpoints are allowed on this deployment." };
    }
    if (allowedHostnames.size > 0 && !allowedHostnames.has(hostname)) {
      return { ok: false, error: "This Ollama hostname is not allowlisted on this deployment." };
    }
  }

  return { ok: true, normalized: normalized.normalized };
}

