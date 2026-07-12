import type { AuthenticatedUser } from "@/lib/server/auth-user";
import { requireLocalApiUser } from "@/lib/server/request-guards";

const JSON_HEADERS = {
  "Content-Type": "application/json",
} as const;

const parseCsvEnv = (value: string | undefined) =>
  new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );

export function isAdminUser(user: Pick<AuthenticatedUser, "email" | "id">) {
  const allowedEmails = parseCsvEnv(process.env.NODES_ADMIN_EMAILS);
  const allowedUserIds = parseCsvEnv(process.env.NODES_ADMIN_USER_IDS);

  const email = user.email?.trim().toLowerCase() ?? "";
  const id = user.id.trim().toLowerCase();

  if (allowedEmails.size === 0 && allowedUserIds.size === 0) {
    if (process.env.NODE_ENV === "development") {
      const devEmail = process.env.AUTH_DEV_EMAIL?.trim().toLowerCase();
      return Boolean(devEmail) && email === devEmail;
    }
    return false;
  }

  return (email.length > 0 && allowedEmails.has(email)) || allowedUserIds.has(id);
}

export type AdminApiUserResult =
  | { response: Response }
  | { user: AuthenticatedUser };

export async function requireAdminApiUser(
  req: Request,
): Promise<AdminApiUserResult> {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) {
    return guarded;
  }

  if (!isAdminUser(guarded.user)) {
    return {
      response: new Response(JSON.stringify({ error: "Admin access required." }), {
        headers: JSON_HEADERS,
        status: 403,
      }),
    };
  }

  return guarded;
}
