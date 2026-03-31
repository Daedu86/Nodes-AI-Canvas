import type { ModelConfig } from "@/components/context/session-ui-state";

export type BudgetStatus = "healthy" | "warning" | "over";

export type ContextBudgetPolicy = {
  recommendedPromptTokens: number;
  maxArtifactTokensPerPrompt: number;
  maxArtifactsPerPrompt: number;
  maxCharsPerArtifact: number;
  maxImagePreviewBytes: number;
  maxImagePreviewDimension: number;
  maxUploadImageBytes: number;
  maxUploadFileBytes: number;
  warnSessionBytes: number;
  hardSessionBytes: number;
  label: string;
  note: string;
};

export const DEFAULT_MAX_IMAGE_PREVIEW_BYTES = 160 * 1024;
export const DEFAULT_MAX_IMAGE_PREVIEW_DIMENSION = 720;
export const DEFAULT_MAX_UPLOAD_IMAGE_BYTES = 6 * 1024 * 1024;
export const DEFAULT_MAX_UPLOAD_FILE_BYTES = 8 * 1024 * 1024;

export const estimateTokenCount = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
};

export const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
};

export const getBudgetStatus = (value: number, warningThreshold: number, hardThreshold = warningThreshold) => {
  if (value <= warningThreshold * 0.7) return "healthy" satisfies BudgetStatus;
  if (value <= hardThreshold) return "warning" satisfies BudgetStatus;
  return "over" satisfies BudgetStatus;
};

export const getByteBudgetStatus = (
  bytes: number,
  warnBytes: number,
  hardBytes: number,
): BudgetStatus => {
  if (bytes <= warnBytes) return "healthy";
  if (bytes <= hardBytes) return "warning";
  return "over";
};

export const getContextBudgetPolicy = (modelConfig: ModelConfig): ContextBudgetPolicy => {
  if (modelConfig.provider === "openrouter") {
    if (modelConfig.modelId.includes("step-3.5-flash")) {
      return {
        recommendedPromptTokens: 12000,
        maxArtifactTokensPerPrompt: 3600,
        maxArtifactsPerPrompt: 4,
        maxCharsPerArtifact: 8000,
        maxImagePreviewBytes: DEFAULT_MAX_IMAGE_PREVIEW_BYTES,
        maxImagePreviewDimension: DEFAULT_MAX_IMAGE_PREVIEW_DIMENSION,
        maxUploadImageBytes: DEFAULT_MAX_UPLOAD_IMAGE_BYTES,
        maxUploadFileBytes: DEFAULT_MAX_UPLOAD_FILE_BYTES,
        warnSessionBytes: 1024 * 1024,
        hardSessionBytes: 2 * 1024 * 1024,
        label: "Recommended app budget",
        note: "Fast free cloud models usually stay responsive when the prompt payload stays below ~12k estimated tokens. Keep attached artifact context well below that ceiling.",
      };
    }

    return {
      recommendedPromptTokens: 8000,
      maxArtifactTokensPerPrompt: 2400,
      maxArtifactsPerPrompt: 4,
      maxCharsPerArtifact: 8000,
      maxImagePreviewBytes: DEFAULT_MAX_IMAGE_PREVIEW_BYTES,
      maxImagePreviewDimension: DEFAULT_MAX_IMAGE_PREVIEW_DIMENSION,
      maxUploadImageBytes: DEFAULT_MAX_UPLOAD_IMAGE_BYTES,
      maxUploadFileBytes: DEFAULT_MAX_UPLOAD_FILE_BYTES,
      warnSessionBytes: 1024 * 1024,
      hardSessionBytes: 2 * 1024 * 1024,
      label: "Recommended app budget",
      note: "Free cloud models often become slower above ~8k estimated prompt tokens. This app keeps artifact context on a separate budget to avoid bloated prompts.",
    };
  }

  return {
    recommendedPromptTokens: 6000,
    maxArtifactTokensPerPrompt: 1800,
    maxArtifactsPerPrompt: 4,
    maxCharsPerArtifact: 6000,
    maxImagePreviewBytes: DEFAULT_MAX_IMAGE_PREVIEW_BYTES,
    maxImagePreviewDimension: DEFAULT_MAX_IMAGE_PREVIEW_DIMENSION,
    maxUploadImageBytes: DEFAULT_MAX_UPLOAD_IMAGE_BYTES,
    maxUploadFileBytes: DEFAULT_MAX_UPLOAD_FILE_BYTES,
    warnSessionBytes: 1024 * 1024,
    hardSessionBytes: 2 * 1024 * 1024,
    label: "Recommended app budget",
    note: "Local models tend to feel better when prompt payload stays below ~6k estimated tokens on a single workstation. Keep artifact context tight for better responsiveness.",
  };
};
