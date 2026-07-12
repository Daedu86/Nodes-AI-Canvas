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

const OFFICE_MAIN_ENTRY_BY_MIME: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "word/document.xml",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "xl/workbook.xml",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "ppt/presentation.xml",
};

const MAX_FILE_NAME_CHARACTERS = 180;
const MAX_FILE_NAME_BYTES = 255;
const MAX_IMAGE_DIMENSION = 16_384;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_OFFICE_ENTRIES = 4_096;
const MAX_OFFICE_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_OFFICE_COMPRESSION_RATIO = 200;
const MAX_JSON_NESTING = 100;
const MAX_ZIP_COMMENT_BYTES = 65_535;
const ZIP_EOCD_MIN_BYTES = 22;

const CONTROL_OR_BIDI_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const RESERVED_WINDOWS_FILE_NAME =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

const normalizeMimeType = (value: string | null | undefined) =>
  (value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";

const getExtension = (fileName: string) => {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.slice(lastDot).toLowerCase() : "";
};

const startsWithBytes = (bytes: Uint8Array, expected: readonly number[], offset = 0) =>
  expected.every((value, index) => bytes[offset + index] === value);

const startsWithAscii = (bytes: Uint8Array, value: string, offset = 0) =>
  [...value].every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );

const readUint16Le = (bytes: Uint8Array, offset: number) =>
  bytes[offset] + bytes[offset + 1] * 0x100;

const readUint16Be = (bytes: Uint8Array, offset: number) =>
  bytes[offset] * 0x100 + bytes[offset + 1];

const readUint24Le = (bytes: Uint8Array, offset: number) =>
  bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x1_0000;

const readUint32Le = (bytes: Uint8Array, offset: number) =>
  bytes[offset] +
  bytes[offset + 1] * 0x100 +
  bytes[offset + 2] * 0x1_0000 +
  bytes[offset + 3] * 0x1_000000;

const readUint32Be = (bytes: Uint8Array, offset: number) =>
  bytes[offset] * 0x1_000000 +
  bytes[offset + 1] * 0x1_0000 +
  bytes[offset + 2] * 0x100 +
  bytes[offset + 3];

const findAscii = (
  bytes: Uint8Array,
  value: string,
  start = 0,
  end = bytes.length,
) => {
  const max = Math.min(end, bytes.length) - value.length;
  for (let offset = Math.max(0, start); offset <= max; offset += 1) {
    if (startsWithAscii(bytes, value, offset)) return offset;
  }
  return -1;
};

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
  if (startsWithAscii(bytes, "ftyp", 4)) {
    const boxSize = readUint32Be(bytes, 0);
    const brandEnd = Math.min(bytes.length, Math.max(16, boxSize || 64), 128);
    for (let offset = 8; offset + 4 <= brandEnd; offset += 4) {
      if (startsWithAscii(bytes, "avif", offset) || startsWithAscii(bytes, "avis", offset)) {
        return "image/avif";
      }
    }
  }
  if (startsWithAscii(bytes, "%PDF-")) {
    return "application/pdf";
  }
  if (startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return "application/zip";
  }
  return null;
};

const validateFileName = (
  rawFileName: string,
):
  | { ok: true; extension: string; fileName: string; mimeType: string }
  | { ok: false; message: string; status: 400 | 415 } => {
  const fileName = rawFileName.normalize("NFC").trim();
  if (!fileName) {
    return { ok: false, message: "The artifact file name is missing.", status: 400 };
  }
  if (fileName.includes("/") || fileName.includes("\\")) {
    return {
      ok: false,
      message: "Artifact file names cannot contain path separators.",
      status: 400,
    };
  }
  if (CONTROL_OR_BIDI_CHARACTERS.test(fileName)) {
    return {
      ok: false,
      message: "The artifact file name contains unsafe control characters.",
      status: 400,
    };
  }
  if (
    [...fileName].length > MAX_FILE_NAME_CHARACTERS ||
    new TextEncoder().encode(fileName).byteLength > MAX_FILE_NAME_BYTES
  ) {
    return { ok: false, message: "The artifact file name is too long.", status: 400 };
  }
  if (fileName.startsWith(".") || RESERVED_WINDOWS_FILE_NAME.test(fileName)) {
    return {
      ok: false,
      message: "The artifact file name is reserved or hidden.",
      status: 400,
    };
  }

  const extension = getExtension(fileName);
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!extension || !mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      message:
        "Unsupported artifact extension. Use PNG, JPEG, WebP, GIF, AVIF, PDF, TXT, Markdown, JSON, CSV, DOCX, XLSX, or PPTX.",
      status: 415,
    };
  }

  return { ok: true, extension, fileName, mimeType };
};

const isCompatibleDeclaredMimeType = (declaredMimeType: string, expectedMimeType: string) => {
  if (!declaredMimeType || declaredMimeType === "application/octet-stream") return true;
  if (declaredMimeType === expectedMimeType) return true;
  if (TEXT_MIME_TYPES.has(expectedMimeType) && declaredMimeType === "text/plain") return true;
  if (OFFICE_MIME_TYPES.has(expectedMimeType) && declaredMimeType === "application/zip") return true;
  return false;
};

const decodeUtf8Text = (bytes: Uint8Array) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

const containsUnsafeTextControls = (text: string) => {
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) continue;
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  }
  return false;
};

const getJsonMaxNesting = (text: string) => {
  let depth = 0;
  let maxDepth = 0;
  let escaped = false;
  let inString = false;
  for (const character of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
    } else if (character === "}" || character === "]") {
      depth = Math.max(0, depth - 1);
    }
  }
  return maxDepth;
};

const validateTextArtifact = (bytes: Uint8Array, mimeType: string) => {
  const text = decodeUtf8Text(bytes);
  if (text === null || containsUnsafeTextControls(text)) {
    return "The selected text artifact is not valid safe UTF-8 text.";
  }
  if (mimeType === "application/json") {
    const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    if (getJsonMaxNesting(normalized) > MAX_JSON_NESTING) {
      return "The selected JSON file is nested too deeply.";
    }
    try {
      JSON.parse(normalized);
    } catch {
      return "The selected JSON file is invalid.";
    }
  }
  return null;
};

const validatePdfArtifact = (bytes: Uint8Array) => {
  const text = new TextDecoder("latin1").decode(bytes);
  if (text.lastIndexOf("%%EOF") < Math.max(0, text.length - 2_048)) {
    return "The PDF is incomplete or missing its end marker.";
  }
  const activeFeature =
    /\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA|OpenAction|AA)\b/u.exec(text)?.[0];
  if (activeFeature) {
    return "PDFs with active scripts, launch actions, forms, or embedded files are not accepted.";
  }
  return null;
};

type ImageDimensions = { height: number; width: number };

const getJpegDimensions = (bytes: Uint8Array): ImageDimensions | null => {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 2 > bytes.length) break;
    const segmentLength = readUint16Be(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      ) &&
      segmentLength >= 7
    ) {
      return {
        height: readUint16Be(bytes, offset + 3),
        width: readUint16Be(bytes, offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
};

const getWebpDimensions = (bytes: Uint8Array): ImageDimensions | null => {
  if (bytes.length < 30) return null;
  if (startsWithAscii(bytes, "VP8X", 12)) {
    return {
      width: readUint24Le(bytes, 24) + 1,
      height: readUint24Le(bytes, 27) + 1,
    };
  }
  if (startsWithAscii(bytes, "VP8L", 12) && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height:
        1 +
        (bytes[22] >> 6) +
        (bytes[23] << 2) +
        ((bytes[24] & 0x0f) << 10),
    };
  }
  if (startsWithAscii(bytes, "VP8 ", 12) && startsWithBytes(bytes, [0x9d, 0x01, 0x2a], 23)) {
    return {
      width: readUint16Le(bytes, 26) & 0x3fff,
      height: readUint16Le(bytes, 28) & 0x3fff,
    };
  }
  return null;
};

const getAvifDimensions = (bytes: Uint8Array): ImageDimensions | null => {
  let offset = 0;
  while (offset >= 0 && offset + 16 <= bytes.length) {
    const ispeOffset = findAscii(bytes, "ispe", offset, Math.min(bytes.length, offset + 512 * 1024));
    if (ispeOffset < 0) return null;
    if (ispeOffset + 16 <= bytes.length) {
      const width = readUint32Be(bytes, ispeOffset + 8);
      const height = readUint32Be(bytes, ispeOffset + 12);
      if (width > 0 && height > 0) return { width, height };
    }
    offset = ispeOffset + 4;
  }
  return null;
};

const getImageDimensions = (bytes: Uint8Array, mimeType: string): ImageDimensions | null => {
  if (mimeType === "image/png" && bytes.length >= 24) {
    return { width: readUint32Be(bytes, 16), height: readUint32Be(bytes, 20) };
  }
  if (mimeType === "image/gif" && bytes.length >= 10) {
    return { width: readUint16Le(bytes, 6), height: readUint16Le(bytes, 8) };
  }
  if (mimeType === "image/jpeg") return getJpegDimensions(bytes);
  if (mimeType === "image/webp") return getWebpDimensions(bytes);
  if (mimeType === "image/avif") return getAvifDimensions(bytes);
  return null;
};

const validateImageArtifact = (bytes: Uint8Array, mimeType: string) => {
  const dimensions = getImageDimensions(bytes, mimeType);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    return "The image dimensions could not be verified.";
  }
  if (
    dimensions.width > MAX_IMAGE_DIMENSION ||
    dimensions.height > MAX_IMAGE_DIMENSION ||
    dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
  ) {
    return "The image dimensions exceed the safe rendering limit.";
  }
  return null;
};

type ZipInspection =
  | { ok: true; entries: Set<string> }
  | { ok: false; message: string };

const inspectOfficeZip = (bytes: Uint8Array): ZipInspection => {
  const searchStart = Math.max(
    0,
    bytes.length - ZIP_EOCD_MIN_BYTES - MAX_ZIP_COMMENT_BYTES,
  );
  let eocdOffset = -1;
  for (let offset = bytes.length - ZIP_EOCD_MIN_BYTES; offset >= searchStart; offset -= 1) {
    if (startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06], offset)) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0 || eocdOffset + ZIP_EOCD_MIN_BYTES > bytes.length) {
    return { ok: false, message: "The Office document has no valid ZIP directory." };
  }

  const diskNumber = readUint16Le(bytes, eocdOffset + 4);
  const directoryDisk = readUint16Le(bytes, eocdOffset + 6);
  const entriesOnDisk = readUint16Le(bytes, eocdOffset + 8);
  const entryCount = readUint16Le(bytes, eocdOffset + 10);
  const directorySize = readUint32Le(bytes, eocdOffset + 12);
  const directoryOffset = readUint32Le(bytes, eocdOffset + 16);
  const commentLength = readUint16Le(bytes, eocdOffset + 20);

  if (
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount < 1 ||
    entryCount > MAX_OFFICE_ENTRIES ||
    directoryOffset + directorySize > eocdOffset ||
    eocdOffset + ZIP_EOCD_MIN_BYTES + commentLength > bytes.length
  ) {
    return { ok: false, message: "The Office ZIP directory is unsupported or malformed." };
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries = new Set<string>();
  let totalUncompressedBytes = 0;
  let cursor = directoryOffset;

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (
      cursor + 46 > eocdOffset ||
      !startsWithBytes(bytes, [0x50, 0x4b, 0x01, 0x02], cursor)
    ) {
      return { ok: false, message: "The Office ZIP directory entry is malformed." };
    }

    const flags = readUint16Le(bytes, cursor + 8);
    const compressionMethod = readUint16Le(bytes, cursor + 10);
    const compressedSize = readUint32Le(bytes, cursor + 20);
    const uncompressedSize = readUint32Le(bytes, cursor + 24);
    const nameLength = readUint16Le(bytes, cursor + 28);
    const extraLength = readUint16Le(bytes, cursor + 30);
    const entryCommentLength = readUint16Le(bytes, cursor + 32);
    const diskStart = readUint16Le(bytes, cursor + 34);
    const localHeaderOffset = readUint32Le(bytes, cursor + 42);
    const nextCursor = cursor + 46 + nameLength + extraLength + entryCommentLength;

    if (
      (flags & 0x0001) !== 0 ||
      ![0, 8].includes(compressionMethod) ||
      diskStart !== 0 ||
      nameLength < 1 ||
      nextCursor > eocdOffset ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      return { ok: false, message: "The Office ZIP entry uses unsupported features." };
    }

    let entryName: string;
    try {
      entryName = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    } catch {
      return { ok: false, message: "The Office ZIP contains an invalid file name." };
    }

    if (
      !entryName ||
      entryName.includes("\\") ||
      entryName.startsWith("/") ||
      entryName.split("/").some((segment) => segment === "..") ||
      CONTROL_OR_BIDI_CHARACTERS.test(entryName) ||
      entries.has(entryName)
    ) {
      return { ok: false, message: "The Office ZIP contains an unsafe file path." };
    }

    if (
      localHeaderOffset + 30 > directoryOffset ||
      !startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04], localHeaderOffset)
    ) {
      return { ok: false, message: "The Office ZIP local entry is malformed." };
    }
    const localNameLength = readUint16Le(bytes, localHeaderOffset + 26);
    const localExtraLength = readUint16Le(bytes, localHeaderOffset + 28);
    if (localHeaderOffset + 30 + localNameLength + localExtraLength > directoryOffset) {
      return { ok: false, message: "The Office ZIP local entry exceeds its bounds." };
    }
    let localName: string;
    try {
      localName = decoder.decode(
        bytes.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength),
      );
    } catch {
      return { ok: false, message: "The Office ZIP local file name is invalid." };
    }
    if (localName !== entryName) {
      return { ok: false, message: "The Office ZIP directory names do not match." };
    }

    if (compressionMethod === 0 && compressedSize !== uncompressedSize) {
      return { ok: false, message: "The Office ZIP stored entry has an invalid size." };
    }
    if (
      compressionMethod === 8 &&
      uncompressedSize >
        Math.max(1024 * 1024, compressedSize * MAX_OFFICE_COMPRESSION_RATIO)
    ) {
      return { ok: false, message: "The Office ZIP entry is compressed too aggressively." };
    }

    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_OFFICE_UNCOMPRESSED_BYTES) {
      return { ok: false, message: "The Office document expands beyond the safe limit." };
    }

    entries.add(entryName);
    cursor = nextCursor;
  }

  if (cursor > directoryOffset + directorySize) {
    return { ok: false, message: "The Office ZIP directory size is inconsistent." };
  }
  return { ok: true, entries };
};

const validateOfficeArtifact = (bytes: Uint8Array, mimeType: string) => {
  const inspection = inspectOfficeZip(bytes);
  if (!inspection.ok) return inspection.message;
  const requiredMainEntry = OFFICE_MAIN_ENTRY_BY_MIME[mimeType];
  if (
    !inspection.entries.has("[Content_Types].xml") ||
    !inspection.entries.has("_rels/.rels") ||
    !requiredMainEntry ||
    !inspection.entries.has(requiredMainEntry)
  ) {
    return "The Office document package does not match its declared type.";
  }
  return null;
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
  | {
      ok: true;
      fileName: string;
      isImage: boolean;
      maxBytes: number;
      mimeType: string;
    }
  | { ok: false; message: string; status: 400 | 413 | 415 };

export function validateArtifactUpload(input: {
  bytes: Uint8Array;
  declaredMimeType?: string | null;
  fileName: string;
}): ArtifactUploadValidation {
  const fileNameValidation = validateFileName(input.fileName);
  if (!fileNameValidation.ok) return fileNameValidation;

  const declaredMimeType = normalizeMimeType(input.declaredMimeType);
  const mimeType = fileNameValidation.mimeType;
  if (!isCompatibleDeclaredMimeType(declaredMimeType, mimeType)) {
    return {
      ok: false,
      message: "The artifact extension and declared file type do not match.",
      status: 415,
    };
  }

  const isImage = IMAGE_MIME_TYPES.has(mimeType);
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
  if (isImage || mimeType === "application/pdf") {
    if (detectedBinaryMimeType !== mimeType) {
      return {
        ok: false,
        message: "The artifact contents do not match the file extension.",
        status: 415,
      };
    }
  }
  if (OFFICE_MIME_TYPES.has(mimeType) && detectedBinaryMimeType !== "application/zip") {
    return {
      ok: false,
      message: "The Office document is not a valid Open XML ZIP file.",
      status: 415,
    };
  }

  const contentError = isImage
    ? validateImageArtifact(input.bytes, mimeType)
    : mimeType === "application/pdf"
      ? validatePdfArtifact(input.bytes)
      : OFFICE_MIME_TYPES.has(mimeType)
        ? validateOfficeArtifact(input.bytes, mimeType)
        : TEXT_MIME_TYPES.has(mimeType)
          ? validateTextArtifact(input.bytes, mimeType)
          : "The artifact type is unsupported.";

  if (contentError) {
    return { ok: false, message: contentError, status: 415 };
  }

  return {
    ok: true,
    fileName: fileNameValidation.fileName,
    isImage,
    maxBytes,
    mimeType,
  };
}
