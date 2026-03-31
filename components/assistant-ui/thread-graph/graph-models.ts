import type { Node } from "@/components/assistant-ui/thread-graph/graph-types";
import { MODEL_OPTIONS } from "@/lib/model-options";

export type GraphLegendItem = {
  key: string;
  label: string;
  swatch: string;
};

type GraphModelPaletteArgs = {
  defaultFill: string;
  defaultStroke: string;
  isDarkBg: boolean;
  model?: string | null;
  provider?: string | null;
};

const stripOptionSuffix = (label: string) =>
  label.replace(/\s+\((free|local optional)\)$/i, "");

const getModelFamilyKey = (model?: string | null, provider?: string | null) => {
  const normalizedModel = (model ?? "").toLowerCase();
  const normalizedProvider = (provider ?? "").toLowerCase();

  if (
    normalizedProvider.includes("stepfun") ||
    normalizedModel.includes("stepfun/") ||
    normalizedModel.includes("step-3.5-flash")
  ) {
    return "stepfun:step-3.5-flash";
  }

  if (normalizedModel.includes("grok") || normalizedProvider.includes("x-ai")) {
    return "x-ai:grok";
  }

  if (
    normalizedProvider.includes("amazon") ||
    normalizedModel.includes("amazon/") ||
    normalizedModel.includes("nova")
  ) {
    return "amazon:nova";
  }

  if (normalizedProvider === "openrouter" && normalizedModel) {
    return `openrouter:${normalizedModel}`;
  }

  if (normalizedProvider === "ollama" && normalizedModel) {
    return `ollama:${normalizedModel}`;
  }

  if (normalizedProvider || normalizedModel) {
    return `${normalizedProvider || "unknown"}:${normalizedModel || "default"}`;
  }

  return "default";
};

export const getGraphModelLabel = (model?: string | null, provider?: string | null) => {
  const normalizedModel = model ?? "";
  const normalizedProvider = provider ?? "";

  const option = MODEL_OPTIONS.find(
    (entry) => entry.modelId === normalizedModel && entry.provider === normalizedProvider,
  );
  if (option) {
    return stripOptionSuffix(option.label);
  }

  if (normalizedProvider === "openrouter" && normalizedModel) {
    return `OpenRouter · ${normalizedModel}`;
  }

  if (normalizedProvider === "ollama" && normalizedModel) {
    return `Ollama · ${normalizedModel}`;
  }

  if (normalizedModel) {
    return normalizedModel;
  }

  if (normalizedProvider) {
    return normalizedProvider;
  }

  return "Default";
};

export const getGraphModelPalette = ({
  defaultFill,
  defaultStroke,
  isDarkBg,
  model,
  provider,
}: GraphModelPaletteArgs) => {
  const familyKey = getModelFamilyKey(model, provider);

  if (familyKey === "x-ai:grok") {
    return {
      fill: isDarkBg ? "rgba(251,146,60,0.9)" : "rgba(254,215,170,0.95)",
      stroke: isDarkBg ? "rgba(249,115,22,0.7)" : "rgba(249,115,22,0.55)",
      swatch: "#f97316",
    };
  }

  if (familyKey === "amazon:nova") {
    return {
      fill: isDarkBg ? "rgba(148,163,184,0.8)" : "rgba(229,231,235,0.95)",
      stroke: isDarkBg ? "rgba(209,213,219,0.65)" : "rgba(156,163,175,0.6)",
      swatch: "#9ca3af",
    };
  }

  if (familyKey === "stepfun:step-3.5-flash") {
    return {
      fill: isDarkBg ? "rgba(45,212,191,0.22)" : "rgba(204,251,241,0.95)",
      stroke: isDarkBg ? "rgba(45,212,191,0.65)" : "rgba(13,148,136,0.45)",
      swatch: "#0d9488",
    };
  }

  if (familyKey.startsWith("openrouter:")) {
    return {
      fill: defaultFill,
      stroke: defaultStroke,
      swatch: "#2563eb",
    };
  }

  if (familyKey.startsWith("ollama:")) {
    return {
      fill: defaultFill,
      stroke: defaultStroke,
      swatch: "#16a34a",
    };
  }

  return {
    fill: defaultFill,
    stroke: defaultStroke,
    swatch: "#64748b",
  };
};

export const buildGraphLegendItems = (nodes: Node[]): GraphLegendItem[] => {
  const legendMap = new Map<string, GraphLegendItem>();

  nodes.forEach((node) => {
    if (node.id === "__ROOT__") return;
    if (!node.model && !node.provider) return;

    const key = getModelFamilyKey(node.model, node.provider);
    if (legendMap.has(key)) return;

    const palette = getGraphModelPalette({
      defaultFill: "rgba(255,255,255,0.94)",
      defaultStroke: "rgba(15,23,42,0.08)",
      isDarkBg: false,
      model: node.model,
      provider: node.provider,
    });

    legendMap.set(key, {
      key,
      label: getGraphModelLabel(node.model, node.provider),
      swatch: palette.swatch,
    });
  });

  return [...legendMap.values()].sort((a, b) => a.label.localeCompare(b.label));
};
