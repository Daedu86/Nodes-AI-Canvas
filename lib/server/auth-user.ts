import { auth } from "@/auth";
import {
  isE2eEnvAuthAllowed,
  isE2eHeaderAuthAllowed,
} from "@/lib/server/e2e-auth";
import { verifyAgentToken } from "@/lib/server/agent-token";

const JSON_HEADERS = {
  "Content-Type": "application/json",
} as const;

export type AuthenticatedUser = {
  email: string | null;
  id: string;
  name: string | null;
};

function getTestAuthenticatedUser(req?: Request): AuthenticatedUser | null {
  if (isE2eHeaderAuthAllowed()) {
    if (req?.headers.get("x-test-auth") === "none") {
      return null;
    }

    const id = req?.headers.get("x-test-user-id")?.trim() || "test-user";
    const email = req?.headers.get("x-test-user-email")?.trim() || "test@nodes.local";
    const name = req?.headers.get("x-test-user-name")?.trim() || "Test User";

    return {
      email,
      id,
      name,
    };
  }

  if (!isE2eEnvAuthAllowed() || !process.env.E2E_AUTH_USER_ID) {
    return null;
  }

  return {
    email: process.env.E2E_AUTH_USER_EMAIL?.trim() || "e2e@nodes.local",
    id: process.env.E2E_AUTH_USER_ID,
    name: process.env.E2E_AUTH_USER_NAME?.trim() || "E2E User",
  };
}

export async function getAuthenticatedUser(req?: Request): Promise<AuthenticatedUser | null> {
  const testUser = getTestAuthenticatedUser(req);
  if (testUser) {
    return testUser;
  }

  const authHeader = req?.headers.get("authorization") ?? null;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice("bearer ".length).trim();
    const verified = await verifyAgentToken(token);
    if (verified) {
      return {
        email: null,
        id: verified.userId,
        name: "Agent",
      };
    }
  }

  const session = await auth();
  const id = session?.user?.id;
  if (!id) {
    return null;
  }
  return {
    email: session.user.email ?? null,
    id,
    name: session.user.name ?? null,
  };
}

export async function requireAuthenticatedUser(req?: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required." }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }
  return user;
}
