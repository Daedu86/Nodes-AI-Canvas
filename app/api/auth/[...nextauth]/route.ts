import { auth, authHandler } from "@/auth";
import { isE2eEnvAuthAllowed } from "@/lib/server/e2e-auth";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  const { nextauth } = await context.params;
  if (isE2eEnvAuthAllowed() && process.env.E2E_AUTH_USER_ID && nextauth[0] === "session") {
    return Response.json(await auth());
  }
  return authHandler(req, context);
}

export { authHandler as POST };
