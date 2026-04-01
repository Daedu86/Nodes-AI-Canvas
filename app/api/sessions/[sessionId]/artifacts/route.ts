import { getSession } from "@/lib/session-store";
import { saveSessionArtifactBlob } from "@/lib/session-blob-store";
import {
  DEFAULT_MAX_UPLOAD_FILE_BYTES,
  DEFAULT_MAX_UPLOAD_IMAGE_BYTES,
  formatBytes,
} from "@/lib/context-budget";
import { enforceLocalApiAccess } from "@/lib/server/api-access";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(req: Request, context: RouteParams) {
  const accessError = enforceLocalApiAccess(req);
  if (accessError) return accessError;

  const { sessionId } = await context.params;

  try {
    try {
      await getSession(sessionId);
    } catch {
      return new Response("Session not found", { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return new Response("Missing file", { status: 400 });
    }

    const isImage = (file.type || "").startsWith("image/");
    const maxUploadBytes = isImage ? DEFAULT_MAX_UPLOAD_IMAGE_BYTES : DEFAULT_MAX_UPLOAD_FILE_BYTES;
    if (file.size > maxUploadBytes) {
      return new Response(
        `Artifact too large. Selected ${isImage ? "image" : "file"} is ${formatBytes(file.size)} and the limit is ${formatBytes(maxUploadBytes)}.`,
        { status: 413 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const saved = await saveSessionArtifactBlob({
      sessionId,
      fileName: file.name,
      bytes,
    });

    return Response.json({
      blobRef: saved.blobRef,
      byteSize: file.size,
      fileName: file.name,
      mimeType: file.type || null,
    });
  } catch (error) {
    console.error("Artifact upload failed", error);
    return new Response("Artifact upload failed", { status: 500 });
  }
}
