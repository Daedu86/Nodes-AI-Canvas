import { enforceLocalApiAccess } from "@/lib/server/api-access";
import { requireAuthenticatedUser, type AuthenticatedUser } from "@/lib/server/auth-user";

export async function requireLocalApiUser(req: Request): Promise<
  | { response: Response; user?: never }
  | { response?: never; user: AuthenticatedUser }
> {
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
