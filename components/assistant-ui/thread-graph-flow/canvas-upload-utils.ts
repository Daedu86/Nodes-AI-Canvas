"use client";

import { getContextBudgetPolicy } from "@/lib/context-budget";

export const getFileStem = (fileName: string) => {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  return stem.length > 0 ? stem : fileName;
};

const textLikeExtensions = new Set([
  "txt",
  "md",
  "mdx",
  "json",
  "jsonl",
  "yaml",
  "yml",
  "toml",
  "ini",
  "csv",
  "tsv",
  "xml",
  "html",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "cs",
  "php",
  "sql",
  "sh",
  "ps1",
  "env",
  "gitignore",
  "lock",
]);

export const isTextLikeFile = (file: File) => {
  const mime = file.type.toLowerCase();
  if (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("xml") ||
    mime.includes("yaml") ||
    mime.includes("markdown") ||
    mime.includes("csv")
  ) {
    return true;
  }

  const extension = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : file.name.toLowerCase();
  return extension ? textLikeExtensions.has(extension) : false;
};

export const estimateDataUrlBytes = (dataUrl: string) => {
  const [, base64 = ""] = dataUrl.split(",", 2);
  return Math.ceil((base64.length * 3) / 4);
};

export const buildImagePreviewDataUrl = async (
  file: File,
  maxBytes: number,
  maxDimension: number,
) => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Failed to load image preview"));
      element.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to prepare image preview canvas");
    }

    const dimensionCandidates = Array.from(
      new Set(
        [
          maxDimension,
          Math.min(maxDimension, 640),
          Math.min(maxDimension, 520),
          Math.min(maxDimension, 420),
          Math.min(maxDimension, 320),
        ].filter((value) => value > 0),
      ),
    );
    const qualities = [0.74, 0.62, 0.5, 0.38, 0.28];

    let bestDataUrl = "";
    let bestByteDelta = Number.POSITIVE_INFINITY;

    for (const dimension of dimensionCandidates) {
      const scale = Math.min(
        1,
        dimension / Math.max(image.width, image.height),
      );
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of qualities) {
        const candidate = canvas.toDataURL("image/webp", quality);
        const candidateBytes = estimateDataUrlBytes(candidate);
        if (
          !bestDataUrl ||
          Math.abs(candidateBytes - maxBytes) < bestByteDelta
        ) {
          bestDataUrl = candidate;
          bestByteDelta = Math.abs(candidateBytes - maxBytes);
        }
        if (candidateBytes <= maxBytes) {
          return candidate;
        }
      }
    }
    return bestDataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const trimStoredArtifactContent = (
  value: string,
  maxChars: number,
) => {
  const normalized = value.trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
};

export const getArtifactUploadLimit = (
  artifactType: "image" | "file",
  policy: ReturnType<typeof getContextBudgetPolicy>,
) =>
  artifactType === "image"
    ? policy.maxUploadImageBytes
    : policy.maxUploadFileBytes;
