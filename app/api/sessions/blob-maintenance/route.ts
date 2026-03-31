import {
  cleanupSessionBlobStore,
  getSessionBlobMaintenanceSummary,
} from "@/lib/session-store";

export const runtime = "nodejs";

export async function GET() {
  const maintenance = await getSessionBlobMaintenanceSummary();
  return Response.json({ maintenance });
}

export async function POST() {
  const cleanup = await cleanupSessionBlobStore();
  return Response.json({ cleanup });
}
