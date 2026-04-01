import {
  cleanupSessionBlobStore,
  getSessionBlobMaintenanceSummary,
} from "@/lib/session-store";
import { enforceLocalApiAccess } from "@/lib/server/api-access";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const accessError = enforceLocalApiAccess(req);
  if (accessError) return accessError;

  const maintenance = await getSessionBlobMaintenanceSummary();
  return Response.json({ maintenance });
}

export async function POST(req: Request) {
  const accessError = enforceLocalApiAccess(req);
  if (accessError) return accessError;

  const cleanup = await cleanupSessionBlobStore();
  return Response.json({ cleanup });
}
