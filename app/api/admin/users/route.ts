import { listAdminUsers, updateAdminUserPlan } from "@/lib/server/admin-users";
import { requireAdminApiUser } from "@/lib/server/admin-access";
import { normalizeUserPlan } from "@/lib/user-plan";

export const runtime = "nodejs";

type UpdateBody = {
  ownerId?: string;
  plan?: string;
};

export async function GET(req: Request) {
  const guarded = await requireAdminApiUser(req);
  if ("response" in guarded) return guarded.response;

  const users = await listAdminUsers();
  return Response.json({
    users,
    viewer: {
      email: guarded.user.email,
      id: guarded.user.id,
    },
  });
}

export async function PATCH(req: Request) {
  const guarded = await requireAdminApiUser(req);
  if ("response" in guarded) return guarded.response;

  const body = (await req.json().catch(() => ({}))) as UpdateBody;
  const ownerId = typeof body.ownerId === "string" ? body.ownerId.trim() : "";
  const plan = typeof body.plan === "string" ? body.plan.trim() : "";
  if (!ownerId) {
    return Response.json({ error: "ownerId is required." }, { status: 400 });
  }
  if (plan !== "free" && plan !== "paid") {
    return Response.json({ error: "plan must be free or paid." }, { status: 400 });
  }

  const updated = await updateAdminUserPlan(ownerId, normalizeUserPlan(plan));
  if (!updated) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  return Response.json({
    user: updated,
  });
}
