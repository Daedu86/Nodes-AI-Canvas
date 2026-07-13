import { z } from "zod";
import { ProjectAccessError } from "@/lib/project-collaboration";
import { ProjectInvitationError } from "@/lib/project-invitation-service";
import {
  apiError,
  type ApiErrorDescriptor,
} from "@/lib/server/api-response";

export const projectInvitationTokenBodySchema = z.object({
  token: z.string().min(1).max(128),
}).strict();

export const projectNotFoundApiError = {
  code: "project_not_found",
  error: "Project not found",
  status: 404,
} satisfies ApiErrorDescriptor;

export function projectInvitationErrorResponse(
  error: unknown,
  fallback: ApiErrorDescriptor,
) {
  if (error instanceof ProjectInvitationError) {
    return apiError({
      code: error.code,
      error: error.message,
      status: error.status,
    });
  }
  if (error instanceof ProjectAccessError) {
    return apiError({
      code: "project_access_denied",
      error: error.message,
      status: error.status,
    });
  }
  return apiError(fallback);
}
