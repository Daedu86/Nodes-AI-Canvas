import {
  cleanupSessionBlobStore,
  getSessionBlobMaintenanceSummary,
} from "@/lib/session-store";
import { requireAdminApiUser } from "@/lib/server/admin-access";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const guarded = await requireAdminApiUser(req);
  if ("response" in guarded) return guarded.response;

  try {
    const maintenance = await getSessionBlobMaintenanceSummary();
    return Response.json({ maintenance });
  } catch (error) {
    console.error("Failed to read session blob maintenance", error);
    return Response.json(
      { error: "Failed to read session blob maintenance." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const guarded = await requireAdminApiUser(req);
  if ("response" in guarded) return guarded.response;

  try {
    const cleanup = await cleanupSessionBlobStore();
    return Response.json({ cleanup });
  } catch (error) {
    console.error("Failed to clean session blob storage", error);
    return Response.json(
      { error: "Failed to clean session blob storage." },
      { status: 500 },
    );
  }
}
