import type { NextAuthOptions, Session } from "next-auth";
import NextAuth from "next-auth/next";
import { getServerSession } from "next-auth/next";
import type { Provider } from "next-auth/providers/index";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { isE2eEnvAuthAllowed } from "@/lib/server/e2e-auth";

const DEV_AUTH_EMAIL = process.env.AUTH_DEV_EMAIL?.trim() || "demo@nodes.local";
const DEV_AUTH_PASSWORD = process.env.AUTH_DEV_PASSWORD?.trim() || "dev-password";
const DEV_AUTH_NAME = process.env.AUTH_DEV_NAME?.trim() || "Local Developer";
const E2E_AUTH_USER_ID = process.env.E2E_AUTH_USER_ID?.trim() || null;
const E2E_AUTH_USER_EMAIL = process.env.E2E_AUTH_USER_EMAIL?.trim() || "e2e@nodes.local";
const E2E_AUTH_USER_NAME = process.env.E2E_AUTH_USER_NAME?.trim() || "E2E User";

const githubConfigured = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
const devCredentialsEnabled =
  process.env.AUTH_ENABLE_DEV_CREDENTIALS === "1" || process.env.NODE_ENV !== "production";

const providers: Provider[] = [];

if (githubConfigured) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
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

export const authUiConfig = {
  canonicalAppUrl: process.env.NEXTAUTH_URL?.trim() || null,
  devCredentialsDefaultEmail: DEV_AUTH_EMAIL,
  devCredentialsEnabled,
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
