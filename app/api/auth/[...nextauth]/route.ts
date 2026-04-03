import { auth, authHandler } from "@/auth";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  const { nextauth } = await context.params;
  if (process.env.E2E_AUTH_USER_ID && nextauth[0] === "session") {
    return Response.json(await auth());
  }
  return authHandler(req, context);
}

export { authHandler as POST };
