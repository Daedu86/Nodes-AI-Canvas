import { enforceLocalApiAccess } from "@/lib/server/api-access";
import {
  requireAuthenticatedUser,
  type AuthenticatedUser,
} from "@/lib/server/auth-user";

export type LocalApiUserResult =
  | { response: Response }
  | { user: AuthenticatedUser };

export async function requireLocalApiUser(
  req: Request,
): Promise<LocalApiUserResult> {
  const accessError = enforceLocalApiAccess(req);
  if (accessError) {
    return { response: accessError };
  }

  const user = await requireAuthenticatedUser(req);
  if (user instanceof Response) {
    return { response: user };
  }

  return { user };
}
