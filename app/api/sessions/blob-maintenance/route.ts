import {
  cleanupSessionBlobStore,
  getSessionBlobMaintenanceSummary,
} from "@/lib/session-store";
import { requireLocalApiUser } from "@/lib/server/request-guards";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const maintenance = await getSessionBlobMaintenanceSummary();
  return Response.json({ maintenance });
}

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const cleanup = await cleanupSessionBlobStore();
  return Response.json({ cleanup });
}
