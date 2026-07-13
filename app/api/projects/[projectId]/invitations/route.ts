import { z } from "zod";
import {
  createProjectInvitationForUser,
  listProjectInvitationsForUser,
} from "@/lib/project-invitation-service";
import { jsonNoStore, parseJsonBody } from "@/lib/server/api-response";
import {
  projectInvitationErrorResponse,
  projectNotFoundApiError,
} from "@/lib/server/project-invitation-http";
import { getPublicAppOrigin } from "@/lib/server/public-app-origin";
import { requireLocalApiUser } from "@/lib/server/request-guards";

const createSchema = z.object({
  email: z.string().trim().min(3).max(254),
  expiresAt: z.union([z.string(), z.number()]).optional(),
  role: z.enum(["editor", "viewer"]),
}).strict();

type RouteParams = { params: Promise<{ projectId: string }> };
export const runtime = "nodejs";

export async function GET(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  const { projectId } = await context.params;
  try {
    const invitations = await listProjectInvitationsForUser(projectId, guarded.user);
    return jsonNoStore({ invitations });
  } catch (error) {
    return projectInvitationErrorResponse(error, projectNotFoundApiError);
  }
}

export async function POST(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  const parsed = await parseJsonBody(req, createSchema, {
    code: "invalid_project_invitation",
    error: "Email and role are required.",
    status: 400,
  });
  if (!parsed.ok) return parsed.response;
  const { projectId } = await context.params;
  try {
    const result = await createProjectInvitationForUser({
      appOrigin: getPublicAppOrigin(req),
      email: parsed.data.email,
      expiresAt: parsed.data.expiresAt,
      projectId,
      role: parsed.data.role,
      user: guarded.user,
    });
    return jsonNoStore(result, { status: 201 });
  } catch (error) {
    return projectInvitationErrorResponse(error, projectNotFoundApiError);
  }
}
