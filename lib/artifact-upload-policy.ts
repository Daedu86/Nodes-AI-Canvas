import {
  DEFAULT_MAX_UPLOAD_FILE_BYTES,
  DEFAULT_MAX_UPLOAD_IMAGE_BYTES,
} from "@/lib/context-budget";

export const SESSION_ARTIFACT_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "application/pdf",
  "application/json",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

const IMAGE_MIME_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const TEXT_MIME_TYPES = new Set<string>([
  "application/json",
  "text/plain",
  "text/markdown",
  "text/csv",
]);
const OFFICE_MIME_TYPES = new Set<string>([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const ALLOWED_MIME_TYPES = new Set<string>(SESSION_ARTIFACT_ALLOWED_MIME_TYPES);

const MIME_BY_EXTENSION: Record<string, string> = {
  ".avif": "image/avif",
  ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const getExtension = (fileName: string) => {
  const normalized = fileName.trim().toLowerCase();
  const lastDot = normalized.lastIndexOf(".");
  return lastDot >= 0 ? normalized.slice(lastDot) : "";
};

const normalizeMimeType = (value: string | null | undefined) =>
  (value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";

const startsWithBytes = (bytes: Uint8Array, expected: number[]) =>
  expected.every((value, index) => bytes[index] === value);

const startsWithAscii = (bytes: Uint8Array, value: string, offset = 0) =>
  [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));

const detectBinaryMimeType = (bytes: Uint8Array): string | null => {
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWithAscii(bytes, "GIF87a") || startsWithAscii(bytes, "GIF89a")) {
    return "image/gif";
  }
  if (startsWithAscii(bytes, "RIFF") && startsWithAscii(bytes, "WEBP", 8)) {
    return "image/webp";
  }
  if (
    startsWithAscii(bytes, "ftyp", 4) &&
    (startsWithAscii(bytes, "avif", 8) || startsWithAscii(bytes, "avis", 8))
  ) {
    return "image/avif";
  }
  if (startsWithAscii(bytes, "%PDF-")) {
    return "application/pdf";
  }
  if (startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return "application/zip";
  }
  return null;
};

const looksLikeSafeText = (bytes: Uint8Array) => {
  const sample = bytes.subarray(0, Math.min(bytes.length, 64 * 1024));
  let suspiciousControls = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) suspiciousControls += 1;
  }
  return suspiciousControls <= Math.max(2, Math.floor(sample.length * 0.01));
};

export const getSessionArtifactStorageQuotaBytes = () => {
  const configured = Number(process.env.NODES_USER_STORAGE_QUOTA_BYTES);
  if (Number.isSafeInteger(configured) && configured > 0) return configured;
  return 100 * 1024 * 1024;
};

export const getSessionArtifactMaxBlobBytes = () => DEFAULT_MAX_UPLOAD_FILE_BYTES;

export const isArtifactImageMimeType = (mimeType: string | null | undefined) =>
  IMAGE_MIME_TYPES.has(normalizeMimeType(mimeType));

export type ArtifactUploadValidation =
  | { ok: true; isImage: boolean; mimeType: string; maxBytes: number }
  | { ok: false; message: string; status: 400 | 413 | 415 };

export function validateArtifactUpload(input: {
  bytes: Uint8Array;
  declaredMimeType?: string | null;
  fileName: string;
}): ArtifactUploadValidation {
  const extensionMimeType = MIME_BY_EXTENSION[getExtension(input.fileName)] ?? "";
  const declaredMimeType = normalizeMimeType(input.declaredMimeType);
  const requestedMimeType =
    declaredMimeType && declaredMimeType !== "application/octet-stream"
      ? declaredMimeType
      : extensionMimeType;

  if (!requestedMimeType || !ALLOWED_MIME_TYPES.has(requestedMimeType)) {
    return {
      ok: false,
      message: "Unsupported artifact type. Use a safe image, PDF, text, JSON, CSV, Markdown, or Office document.",
      status: 415,
    };
  }

  const isImage = IMAGE_MIME_TYPES.has(requestedMimeType);
  const maxBytes = isImage ? DEFAULT_MAX_UPLOAD_IMAGE_BYTES : DEFAULT_MAX_UPLOAD_FILE_BYTES;
  if (input.bytes.byteLength > maxBytes) {
    return {
      ok: false,
      message: `Artifact exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB upload limit.`,
      status: 413,
    };
  }
  if (input.bytes.byteLength === 0) {
    return { ok: false, message: "The selected artifact is empty.", status: 400 };
  }

  const detectedBinaryMimeType = detectBinaryMimeType(input.bytes);
  if (IMAGE_MIME_TYPES.has(requestedMimeType) || requestedMimeType === "application/pdf") {
    if (detectedBinaryMimeType !== requestedMimeType) {
      return {
        ok: false,
        message: "The artifact contents do not match the declared file type.",
        status: 415,
      };
    }
  }

  if (OFFICE_MIME_TYPES.has(requestedMimeType) && detectedBinaryMimeType !== "application/zip") {
    return {
      ok: false,
      message: "The Office document is not a valid Open XML file.",
      status: 415,
    };
  }

  if (TEXT_MIME_TYPES.has(requestedMimeType)) {
    if (!looksLikeSafeText(input.bytes)) {
      return {
        ok: false,
        message: "The selected text artifact contains unsupported binary data.",
        status: 415,
      };
    }
    if (requestedMimeType === "application/json") {
      try {
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.bytes));
      } catch {
        return { ok: false, message: "The selected JSON file is invalid.", status: 415 };
      }
    }
  }

  return { ok: true, isImage, mimeType: requestedMimeType, maxBytes };
}
