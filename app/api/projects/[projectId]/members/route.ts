import { z } from "zod";
import {
  createProjectInvitationForUser,
  ProjectInvitationError,
  removeProjectMemberOrInvitationForUser,
  updateAcceptedProjectMemberForUser,
} from "@/lib/project-invitation-service";
import { jsonNoStore, parseJsonBody } from "@/lib/server/api-response";
import { projectInvitationErrorResponse } from "@/lib/server/project-invitation-http";
import { getPublicAppOrigin } from "@/lib/server/public-app-origin";
import { requireLocalApiUser } from "@/lib/server/request-guards";

const memberSchema = z.object({
  email: z.string().trim().min(3).max(254),
  role: z.enum(["editor", "viewer"]),
}).strict();

const removeSchema = z.object({
  email: z.string().trim().min(3).max(254),
}).strict();

const projectNotFound = {
  code: "project_not_found",
  error: "Project not found",
  status: 404,
} as const;

type RouteParams = {
  params: Promise<{ projectId: string }>;
};

export const runtime = "nodejs";

export async function POST(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  const parsed = await parseJsonBody(req, memberSchema, {
    code: "invalid_project_member",
    error: "Member email and role are required.",
    status: 400,
  });
  if (!parsed.ok) return parsed.response;
  const { projectId } = await context.params;
  try {
    try {
      const project = await updateAcceptedProjectMemberForUser({
        email: parsed.data.email,
        projectId,
        role: parsed.data.role,
        user: guarded.user,
      });
      return jsonNoStore({ project });
    } catch (error) {
      if (!(error instanceof ProjectInvitationError) || error.code !== "member_not_accepted") {
        throw error;
      }
    }

    const result = await createProjectInvitationForUser({
      appOrigin: getPublicAppOrigin(req),
      email: parsed.data.email,
      projectId,
      role: parsed.data.role,
      user: guarded.user,
    });
    return jsonNoStore(result, { status: 201 });
  } catch (error) {
    return projectInvitationErrorResponse(error, projectNotFound);
  }
}

export async function DELETE(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  const parsed = await parseJsonBody(req, removeSchema, {
    code: "invalid_project_member",
    error: "Member email is required.",
    status: 400,
  });
  if (!parsed.ok) return parsed.response;
  const { projectId } = await context.params;
  try {
    const project = await removeProjectMemberOrInvitationForUser({
      email: parsed.data.email,
      projectId,
      user: guarded.user,
    });
    return jsonNoStore({ project });
  } catch (error) {
    return projectInvitationErrorResponse(error, projectNotFound);
  }
}
