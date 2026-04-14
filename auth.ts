import type { NextAuthOptions, Session } from "next-auth";
import NextAuth from "next-auth/next";
import { getServerSession } from "next-auth/next";
import type { Provider } from "next-auth/providers/index";
import Credentials from "next-auth/providers/credentials";
import Email from "next-auth/providers/email";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { isE2eEnvAuthAllowed } from "@/lib/server/e2e-auth";
import { verifyAgentToken } from "@/lib/server/agent-token";

const DEV_AUTH_EMAIL = process.env.AUTH_DEV_EMAIL?.trim() || "demo@nodes.local";
const DEV_AUTH_PASSWORD = process.env.AUTH_DEV_PASSWORD?.trim() || "";
const DEV_AUTH_NAME = process.env.AUTH_DEV_NAME?.trim() || "Local Developer";
const E2E_AUTH_USER_ID = process.env.E2E_AUTH_USER_ID?.trim() || null;
const E2E_AUTH_USER_EMAIL = process.env.E2E_AUTH_USER_EMAIL?.trim() || "e2e@nodes.local";
const E2E_AUTH_USER_NAME = process.env.E2E_AUTH_USER_NAME?.trim() || "E2E User";

const githubConfigured = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const emailConfigured = Boolean(process.env.AUTH_EMAIL_SERVER && process.env.AUTH_EMAIL_FROM);
const agentTokenLoginEnabled =
  process.env.AUTH_ENABLE_AGENT_TOKEN_LOGIN !== "0" &&
  Boolean(process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim());
const devCredentialsEnabled =
  process.env.AUTH_ENABLE_DEV_CREDENTIALS === "1" &&
  process.env.NODE_ENV === "development" &&
  DEV_AUTH_PASSWORD.length > 0;

const providers: Provider[] = [];

if (githubConfigured) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
  );
}

if (googleConfigured) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  );
}

if (emailConfigured) {
  providers.push(
    Email({
      server: process.env.AUTH_EMAIL_SERVER!,
      from: process.env.AUTH_EMAIL_FROM!,
    }),
  );
}

if (devCredentialsEnabled) {
  providers.push(
    Credentials({
      id: "dev-credentials",
      name: "Local credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (email !== DEV_AUTH_EMAIL || password !== DEV_AUTH_PASSWORD) {
          return null;
        }
        return {
          id: `dev:${DEV_AUTH_EMAIL}`,
          email: DEV_AUTH_EMAIL,
          name: DEV_AUTH_NAME,
        };
      },
    }),
  );
}

if (agentTokenLoginEnabled) {
  providers.push(
    Credentials({
      id: "agent-token",
      name: "Agent token",
      credentials: {
        token: { label: "Agent token", type: "password" },
      },
      async authorize(credentials) {
        const token = typeof credentials?.token === "string" ? credentials.token.trim() : "";
        if (!token) return null;
        const verified = await verifyAgentToken(token);
        if (!verified) return null;
        return {
          id: verified.userId,
          email: null,
          name: verified.label ? `Agent (${verified.label})` : "Agent",
        };
      },
    }),
  );
}

function formatAuthLoggerMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const record = metadata as Record<string, unknown>;
  const error = record.error;

  return {
    message: typeof record.message === "string" ? record.message : undefined,
    provider: typeof record.provider === "string" ? record.provider : undefined,
    errorName:
      error && typeof error === "object" && "name" in error && typeof error.name === "string"
        ? error.name
        : undefined,
    errorMessage:
      error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : undefined,
  };
}

export const authUiConfig = {
  canonicalAppUrl: process.env.NEXTAUTH_URL?.trim() || null,
  agentTokenLoginEnabled,
  devCredentialsDefaultEmail: DEV_AUTH_EMAIL,
  devCredentialsEnabled,
  emailConfigured,
  googleConfigured,
  githubConfigured,
} as const;

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim(),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
  },
  providers,
  logger: {
    error(code, metadata) {
      console.error("[auth][next-auth][error]", code, formatAuthLoggerMetadata(metadata));
    },
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      } else if (!token.userId && token.sub) {
        token.userId = token.sub;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.userId === "string" ? token.userId : token.sub ?? "";
      }
      return session;
    },
  },
};

function getE2eSession(): Session | null {
  if (!isE2eEnvAuthAllowed() || !E2E_AUTH_USER_ID) {
    return null;
  }
  return {
    expires: "2999-01-01T00:00:00.000Z",
    user: {
      email: E2E_AUTH_USER_EMAIL,
      id: E2E_AUTH_USER_ID,
      name: E2E_AUTH_USER_NAME,
    },
  };
}

export const auth = async () => getE2eSession() ?? getServerSession(authOptions);

export const authHandler = NextAuth(authOptions);
