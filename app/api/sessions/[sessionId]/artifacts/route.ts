import { getSession } from "@/lib/session-store";
import { saveSessionArtifactBlob } from "@/lib/session-blob-store";
import {
  getSessionArtifactMaxBlobBytes,
  validateArtifactUpload,
} from "@/lib/artifact-upload-policy";
import { formatBytes } from "@/lib/context-budget";
import {
  getSingleArtifactUploadFile,
  validateArtifactUploadRequestHeaders,
} from "@/lib/server/artifact-upload-request";
import { reserveArtifactUploadQuota } from "@/lib/server/artifact-upload-governor";
import { requireLocalApiUser } from "@/lib/server/request-guards";

export const runtime = "nodejs";

const textResponse = (
  message: string,
  status: number,
  headers?: HeadersInit,
) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("Content-Type", "text/plain; charset=utf-8");
  return new Response(message, { status, headers: responseHeaders });
};

type RouteParams = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const requestValidation = validateArtifactUploadRequestHeaders(req.headers);
  if (!requestValidation.ok) {
    return textResponse(requestValidation.message, requestValidation.status);
  }

  const { sessionId } = await context.params;
  let quotaHeaders = new Headers({ "Cache-Control": "no-store" });

  try {
    try {
      await getSession(sessionId, guarded.user.id);
    } catch {
      return textResponse("Session not found", 404);
    }

    const quota = await reserveArtifactUploadQuota(
      guarded.user.id,
      requestValidation.contentLength,
    );
    if (!quota.ok) {
      return Response.json(
        {
          code: quota.rejection.code,
          error: quota.rejection.message,
        },
        {
          status: quota.rejection.status,
          headers: quota.rejection.headers,
        },
      );
    }
    quotaHeaders = quota.headers;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return textResponse("Malformed multipart upload body.", 400, quotaHeaders);
    }

    const file = getSingleArtifactUploadFile(formData);
    if (!file) {
      return textResponse(
        "Artifact uploads must contain exactly one file field.",
        400,
        quotaHeaders,
      );
    }

    const hardLimit = getSessionArtifactMaxBlobBytes();
    if (file.size > hardLimit) {
      return textResponse(
        `Artifact too large. Selected file is ${formatBytes(file.size)} and the maximum is ${formatBytes(hardLimit)}.`,
        413,
        quotaHeaders,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateArtifactUpload({
      bytes,
      declaredMimeType: file.type || null,
      fileName: file.name,
    });
    if (!validation.ok) {
      return textResponse(validation.message, validation.status, quotaHeaders);
    }

    const saved = await saveSessionArtifactBlob({
      sessionId,
      ownerId: guarded.user.id,
      fileName: validation.fileName,
      bytes,
      mimeType: validation.mimeType,
    });

    return Response.json(
      {
        blobRef: saved.blobRef,
        byteSize: bytes.byteLength,
        deduplicated: saved.deduplicated,
        fileName: validation.fileName,
        mimeType: validation.mimeType,
        storageQuotaBytes: saved.storageQuotaBytes,
        storageUsedBytes: saved.storageUsedBytes,
      },
      { headers: quotaHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Artifact upload failed";
    if (message.toLowerCase().includes("storage quota exceeded")) {
      return textResponse("Artifact storage quota exceeded.", 413, quotaHeaders);
    }
    console.error("Artifact upload failed", error);
    return textResponse("Artifact upload failed", 500, quotaHeaders);
  }
}
