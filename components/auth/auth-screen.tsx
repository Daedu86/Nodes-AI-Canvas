"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Github, Globe, LockKeyhole, Mail, Network } from "lucide-react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildPostAuthCallbackUrl } from "@/lib/client/post-auth-handoff";

type AuthScreenProps = {
  authError?: string | null;
  canonicalAppUrl: string | null;
  devCredentialsDefaultEmail: string;
  devCredentialsEnabled: boolean;
  emailConfigured: boolean;
  googleConfigured: boolean;
  githubConfigured: boolean;
};

const getAuthErrorMessage = (error?: string | null) => {
  switch (error) {
    case "OAuthCallback":
      return "GitHub sign-in failed during the OAuth callback. This usually means the production GitHub OAuth callback URL or client secret is wrong.";
    case "AccessDenied":
      return "The sign-in request was denied before a session could be created.";
    case "Configuration":
      return "Authentication is misconfigured in this environment.";
    default:
      return null;
  }
};

export function AuthScreen({
  authError,
  canonicalAppUrl,
  devCredentialsDefaultEmail,
  devCredentialsEnabled,
  emailConfigured,
  googleConfigured,
  githubConfigured,
}: AuthScreenProps) {
  const callbackUrl = useMemo(
    () => buildPostAuthCallbackUrl("/", canonicalAppUrl),
    [canonicalAppUrl],
  );
  const [email, setEmail] = useState(devCredentialsDefaultEmail);
  const [password, setPassword] = useState("");
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMagicLinkSubmitting, setIsMagicLinkSubmitting] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authErrorMessage = useMemo(() => getAuthErrorMessage(authError), [authError]);

  useEffect(() => {
    if (!canonicalAppUrl) return;
    const canonicalOrigin = new URL(canonicalAppUrl).origin;
    if (window.location.origin === canonicalOrigin) return;
    const current = new URL(window.location.href);
    const target = new URL(`${current.pathname}${current.search}${current.hash}`, canonicalOrigin);
    window.location.replace(target.toString());
  }, [canonicalAppUrl]);

  const handleDevLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const result = await signIn("dev-credentials", {
      email,
      password,
      callbackUrl,
      redirect: false,
    });
    setIsSubmitting(false);
    if (result?.error) {
      setError("Invalid local credentials.");
      return;
    }
    window.location.assign(callbackUrl);
  };

  const handleMagicLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMagicLinkSent(false);
    setError(null);

    const normalized = magicLinkEmail.trim();
    if (!normalized) {
      setError("Enter an email address to receive a sign-in link.");
      return;
    }

    setIsMagicLinkSubmitting(true);
    const result = await signIn("email", {
      email: normalized,
      callbackUrl,
      redirect: false,
    });
    setIsMagicLinkSubmitting(false);

    if (result?.error) {
      setError("Unable to send a sign-in link. Check the email provider configuration.");
      return;
    }

    setMagicLinkSent(true);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_40%),linear-gradient(180deg,_rgba(2,6,23,1),_rgba(2,6,23,0.94))] px-6 py-12 text-slate-50">
      <div className="grid w-full max-w-5xl gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.24em] text-sky-200">
            <Network className="size-4" />
            Nodes
          </div>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Sign in to work with branches, projects, and shared AI context.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300">
              Nodes is a decision workspace for exploring multiple AI paths before
              you commit. Authentication now scopes sessions, projects, memory,
              and artifacts to the current user.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium text-white">Branch with intent</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Explore multiple directions without losing the thread.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium text-white">Compare in Arena</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Review sessions, branches, and merge nodes in one place.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium text-white">Keep ownership clear</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Your sessions, projects, memory, and artifacts stay scoped to your account.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl backdrop-blur">
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">
                Authentication
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Access Nodes</h2>
            </div>

            {authErrorMessage ? (
              <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {authErrorMessage}
              </div>
            ) : null}

            <div className="grid gap-3">
              {googleConfigured ? (
                <Button
                  type="button"
                  size="lg"
                  className="w-full justify-center"
                  onClick={() => void signIn("google", { callbackUrl })}
                >
                  <Globe className="size-4" />
                  Continue with Google
                </Button>
              ) : null}

              {githubConfigured ? (
                <Button
                  type="button"
                  size="lg"
                  className="w-full justify-center"
                  onClick={() => void signIn("github", { callbackUrl })}
                >
                  <Github className="size-4" />
                  Continue with GitHub
                </Button>
              ) : null}

              {emailConfigured ? (
                <form className="space-y-3" onSubmit={handleMagicLink}>
                  <div className="space-y-2">
                    <label className="text-sm text-slate-300" htmlFor="magic-email">
                      Email magic link
                    </label>
                    <Input
                      id="magic-email"
                      value={magicLinkEmail}
                      onChange={(event) => setMagicLinkEmail(event.target.value)}
                      autoComplete="email"
                      placeholder="you@example.com"
                    />
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    variant="outline"
                    className="w-full"
                    disabled={isMagicLinkSubmitting}
                  >
                    <Mail className="size-4" />
                    {isMagicLinkSubmitting ? "Sending..." : "Send sign-in link"}
                  </Button>
                  {magicLinkSent ? (
                    <p className="text-xs leading-5 text-slate-300">
                      Check your email for a sign-in link.
                    </p>
                  ) : null}
                </form>
              ) : null}
            </div>

            {!googleConfigured && !githubConfigured && !emailConfigured ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-sm font-medium text-slate-200">
                  No public sign-in provider is configured in this environment.
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Configure OAuth (<code className="rounded bg-black/30 px-1.5 py-0.5 text-slate-200">AUTH_GITHUB_*</code>,{" "}
                  <code className="rounded bg-black/30 px-1.5 py-0.5 text-slate-200">AUTH_GOOGLE_*</code>) or email magic links (
                  <code className="rounded bg-black/30 px-1.5 py-0.5 text-slate-200">AUTH_EMAIL_SERVER</code>,{" "}
                  <code className="rounded bg-black/30 px-1.5 py-0.5 text-slate-200">AUTH_EMAIL_FROM</code>).
                </p>
              </div>
            ) : null}

            {devCredentialsEnabled ? (
              <form className="space-y-4" onSubmit={handleDevLogin}>
                <div className="space-y-2">
                  <label className="text-sm text-slate-300" htmlFor="dev-email">
                    Local dev email
                  </label>
                  <Input
                    id="dev-email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-300" htmlFor="dev-password">
                    Local dev password
                  </label>
                  <Input
                    id="dev-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Use AUTH_DEV_PASSWORD or the local dev default"
                  />
                </div>
                {error ? <p className="text-sm text-rose-300">{error}</p> : null}
                <Button type="submit" size="lg" variant="outline" className="w-full" disabled={isSubmitting}>
                  <LockKeyhole className="size-4" />
                  {isSubmitting ? "Signing in..." : "Sign in with local dev credentials"}
                </Button>
              </form>
            ) : null}

            {!googleConfigured && !githubConfigured && !emailConfigured && !devCredentialsEnabled ? (
              <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                No authentication provider is configured yet. Add GitHub OAuth or enable local
                dev credentials in your environment.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
