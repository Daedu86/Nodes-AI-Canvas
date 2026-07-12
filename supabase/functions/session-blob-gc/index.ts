import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.102.1";

const ALLOWED_MIME_TYPES = [
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
];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (request: Request) => {
  if (request.method !== "POST" && request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bucketId =
    Deno.env.get("SUPABASE_SESSION_ARTIFACTS_BUCKET")?.trim() || "session-artifacts";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase function configuration" }, 500);
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const bucketResult = await client.storage.updateBucket(bucketId, {
      public: false,
      fileSizeLimit: 8 * 1024 * 1024,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    });
    if (bucketResult.error) {
      throw new Error(bucketResult.error.message || "Failed to reconcile storage bucket");
    }

    let claimedBlobCount = 0;
    let deletedBlobCount = 0;
    let deletedBytes = 0;
    let failedBlobCount = 0;

    for (let iteration = 0; iteration < 10; iteration += 1) {
      const claimResult = await client.rpc("claim_session_blob_deletions", {
        p_bucket_id: bucketId,
        p_limit: 1000,
        p_now: new Date().toISOString(),
        p_pending_grace_seconds: 3600,
        p_processing_timeout_seconds: 600,
        p_scan_storage: iteration === 0,
      });
      if (claimResult.error) {
        throw new Error(claimResult.error.message || "Failed to claim blob deletions");
      }

      const claimed = (Array.isArray(claimResult.data) ? claimResult.data : []) as Array<{
        blob_ref: string;
        bucket_id: string;
        byte_size: number | string;
      }>;
      claimedBlobCount += claimed.length;
      if (claimed.length === 0) break;

      const byBucket = new Map<string, typeof claimed>();
      for (const item of claimed) {
        const items = byBucket.get(item.bucket_id) ?? [];
        items.push(item);
        byBucket.set(item.bucket_id, items);
      }

      for (const [targetBucket, items] of byBucket) {
        const removeResult = await client.storage
          .from(targetBucket)
          .remove(items.map((item) => item.blob_ref));

        if (removeResult.error) {
          failedBlobCount += items.length;
          await Promise.all(
            items.map((item) =>
              client.rpc("complete_session_blob_deletion", {
                p_blob_ref: item.blob_ref,
                p_error: removeResult.error?.message ?? "Storage deletion failed",
                p_now: new Date().toISOString(),
                p_retry_seconds: 300,
                p_success: false,
              }),
            ),
          );
          continue;
        }

        deletedBlobCount += items.length;
        deletedBytes += items.reduce(
          (total, item) => total + Number(item.byte_size ?? 0),
          0,
        );
        await Promise.all(
          items.map((item) =>
            client.rpc("complete_session_blob_deletion", {
              p_blob_ref: item.blob_ref,
              p_error: null,
              p_now: new Date().toISOString(),
              p_retry_seconds: 300,
              p_success: true,
            }),
          ),
        );
      }

      if (claimed.length < 1000) break;
    }

    return jsonResponse({
      bucketId,
      claimedBlobCount,
      deletedBlobCount,
      deletedBytes,
      failedBlobCount,
      ok: true,
    });
  } catch (error) {
    console.error("Session blob garbage collection failed", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Session blob garbage collection failed",
        ok: false,
      },
      500,
    );
  }
});
