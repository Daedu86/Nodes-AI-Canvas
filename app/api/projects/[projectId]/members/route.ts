import { z } from "zod";
import { ProjectAccessError } from "@/lib/project-collaboration";
import {
  createProjectInvitationForUser,
  ProjectInvitationError,
  removeProjectMemberOrInvitationForUser,
  updateAcceptedProjectMemberForUser,
} from "@/lib/project-invitation-service";
import { requireLocalApiUser } from "@/lib/server/request-guards";
import { getPublicAppOrigin } from "@/lib/server/public-app-origin";

const memberSchema = z.object({
  email: z.string().trim().min(3).max(254),
  role: z.enum(["editor", "viewer"]),
}).strict();

const removeSchema = z.object({
  email: z.string().trim().min(3).max(254),
}).strict();

type RouteParams = {
  params: Promise<{ projectId: string }>;
};

export const runtime = "nodejs";

const errorResponse = (error: unknown) => {
  if (error instanceof ProjectInvitationError) {
    return Response.json(
      { code: error.code, error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof ProjectAccessError) {
    return Response.json(
      { code: "project_access_denied", error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    { code: "project_not_found", error: "Project not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
};

export async function POST(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  const parsed = memberSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { code: "invalid_project_member", error: "Member email and role are required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { projectId } = await context.params;
  try {
    try {
      const project = await updateAcceptedProjectMemberForUser({
        email: parsed.data.email,
        projectId,
        role: parsed.data.role,
        user: guarded.user,
      });
      return Response.json(
        { project },
        { headers: { "Cache-Control": "no-store" } },
      );
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
    return Response.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  const parsed = removeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { code: "invalid_project_member", error: "Member email is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { projectId } = await context.params;
  try {
    const project = await removeProjectMemberOrInvitationForUser({
      email: parsed.data.email,
      projectId,
      user: guarded.user,
    });
    return Response.json(
      { project },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
