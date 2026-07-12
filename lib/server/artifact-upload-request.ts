import { getSessionArtifactMaxBlobBytes } from "@/lib/artifact-upload-policy";

const MAX_MULTIPART_BOUNDARY_BYTES = 70;
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const DECIMAL_INTEGER = /^[0-9]+$/u;
const SAFE_MULTIPART_BOUNDARY = /^[0-9A-Za-z'()+_,./:=?-]+$/u;

export const getSessionArtifactMaxRequestBytes = () =>
  getSessionArtifactMaxBlobBytes() + MULTIPART_OVERHEAD_BYTES;

export type ArtifactUploadRequestValidation =
  | {
      ok: true;
      contentLength: number;
      maxRequestBytes: number;
    }
  | {
      ok: false;
      message: string;
      status: 400 | 411 | 413 | 415;
    };

export function validateArtifactUploadRequestHeaders(
  headers: Headers,
): ArtifactUploadRequestValidation {
  const contentType = headers.get("content-type")?.trim() ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return {
      ok: false,
      message: "Artifact uploads require multipart/form-data.",
      status: 415,
    };
  }

  const boundaryMatch = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/iu.exec(contentType);
  const boundary = (boundaryMatch?.[1] ?? boundaryMatch?.[2] ?? "").trim();
  if (
    !boundary ||
    new TextEncoder().encode(boundary).byteLength > MAX_MULTIPART_BOUNDARY_BYTES ||
    !SAFE_MULTIPART_BOUNDARY.test(boundary)
  ) {
    return {
      ok: false,
      message: "The multipart boundary is missing or invalid.",
      status: 400,
    };
  }

  const contentLengthHeader = headers.get("content-length")?.trim() ?? "";
  if (!DECIMAL_INTEGER.test(contentLengthHeader)) {
    return {
      ok: false,
      message: "Artifact uploads require a valid Content-Length header.",
      status: 411,
    };
  }

  const contentLength = Number(contentLengthHeader);
  const maxRequestBytes = getSessionArtifactMaxRequestBytes();
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
    return {
      ok: false,
      message: "The artifact upload body length is invalid.",
      status: 400,
    };
  }
  if (contentLength > maxRequestBytes) {
    return {
      ok: false,
      message: "The artifact upload request is too large.",
      status: 413,
    };
  }

  return { ok: true, contentLength, maxRequestBytes };
}

export function getSingleArtifactUploadFile(formData: FormData) {
  const entries = [...formData.entries()];
  const entry = entries[0];
  if (
    entries.length !== 1 ||
    !entry ||
    entry[0] !== "file" ||
    !(entry[1] instanceof File)
  ) {
    return null;
  }
  return entry[1];
}
