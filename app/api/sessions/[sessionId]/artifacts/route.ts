import { getSession } from "@/lib/session-store";
import { saveSessionArtifactBlob } from "@/lib/session-blob-store";
import {
  getSessionArtifactMaxBlobBytes,
  validateArtifactUpload,
} from "@/lib/artifact-upload-policy";
import { formatBytes } from "@/lib/context-budget";
import { requireLocalApiUser } from "@/lib/server/request-guards";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const { sessionId } = await context.params;

  try {
    try {
      await getSession(sessionId, guarded.user.id);
    } catch {
      return new Response("Session not found", { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return new Response("Missing file", { status: 400 });
    }

    const hardLimit = getSessionArtifactMaxBlobBytes();
    if (file.size > hardLimit) {
      return new Response(
        `Artifact too large. Selected file is ${formatBytes(file.size)} and the maximum is ${formatBytes(hardLimit)}.`,
        { status: 413 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateArtifactUpload({
      bytes,
      declaredMimeType: file.type || null,
      fileName: file.name,
    });
    if (!validation.ok) {
      return new Response(validation.message, { status: validation.status });
    }

    const saved = await saveSessionArtifactBlob({
      sessionId,
      ownerId: guarded.user.id,
      fileName: file.name,
      bytes,
      mimeType: validation.mimeType,
    });

    return Response.json({
      blobRef: saved.blobRef,
      byteSize: file.size,
      deduplicated: saved.deduplicated,
      fileName: file.name,
      mimeType: validation.mimeType,
      storageQuotaBytes: saved.storageQuotaBytes,
      storageUsedBytes: saved.storageUsedBytes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Artifact upload failed";
    if (message.toLowerCase().includes("storage quota exceeded")) {
      return new Response("Artifact storage quota exceeded.", { status: 413 });
    }
    console.error("Artifact upload failed", error);
    return new Response("Artifact upload failed", { status: 500 });
  }
}
