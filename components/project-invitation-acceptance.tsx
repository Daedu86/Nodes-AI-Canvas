"use client";

import React from "react";
import { signIn, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import type { ProjectInvitationPreview } from "@/lib/project-invitations";

type PreviewResponse = { invitation: ProjectInvitationPreview };
type ActionResponse = {
  accepted?: { projectId: string; role: string };
  code?: string;
  error?: string;
};

const formatDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export function ProjectInvitationAcceptance({ token }: { token: string }) {
  const { data: session, status: sessionStatus } = useSession();
  const [preview, setPreview] = React.useState<ProjectInvitationPreview | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "working" | "accepted" | "declined" | "error">("loading");
  const [message, setMessage] = React.useState("Loading project invitation...");

  React.useEffect(() => {
    let active = true;
    void fetch(`/api/project-invitations/preview?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as Partial<PreviewResponse> & ActionResponse;
        if (!response.ok || !body.invitation) {
          throw new Error(body.error || "The invitation link is invalid.");
        }
        if (!active) return;
        setPreview(body.invitation);
        setState("ready");
        setMessage(
          body.invitation.status === "pending"
            ? "Review the invitation and sign in with the invited email address."
            : body.invitation.status === "expired"
              ? "This invitation has expired. Ask the project owner for a new link."
              : "This invitation is no longer pending.",
        );
      })
      .catch((error) => {
        if (!active) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "The invitation link is invalid.");
      });
    return () => { active = false; };
  }, [token]);

  const runAction = async (action: "accept" | "decline") => {
    setState("working");
    setMessage(action === "accept" ? "Accepting invitation..." : "Declining invitation...");
    const response = await fetch(`/api/project-invitations/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = (await response.json().catch(() => ({}))) as ActionResponse;
    if (!response.ok) {
      setState("error");
      setMessage(body.error || "The invitation action failed.");
      return;
    }
    if (action === "accept") {
      setState("accepted");
      setMessage("Invitation accepted. The shared project is now available in your workspace.");
    } else {
      setState("declined");
      setMessage("Invitation declined.");
    }
  };

  const signedInEmail = session?.user?.email?.trim().toLowerCase() ?? null;
  const canAct = preview?.status === "pending" && state !== "working";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-border/70 bg-card p-6 shadow-xl">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Nodes project invitation
          </p>
          <h1 className="text-2xl font-semibold text-foreground">
            {preview?.projectTitle?.trim() || "Shared project"}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
        </div>

        {preview ? (
          <dl className="mt-6 grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Invited account</dt>
              <dd className="font-medium text-foreground">{preview.inviteeEmailMasked}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-medium capitalize text-foreground">{preview.role}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Expires</dt>
              <dd className="text-right font-medium text-foreground">{formatDate(preview.expiresAt)}</dd>
            </div>
          </dl>
        ) : null}

        <div className="mt-6 space-y-3">
          {sessionStatus === "unauthenticated" && preview?.status === "pending" ? (
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                void signIn(undefined, { callbackUrl: window.location.href });
              }}
            >
              Sign in to respond
            </Button>
          ) : null}

          {sessionStatus === "authenticated" && canAct ? (
            <>
              <p className="text-xs text-muted-foreground">
                Signed in as <span className="font-medium text-foreground">{signedInEmail ?? "an account without email"}</span>
              </p>
              <div className="flex gap-3">
                <Button
                  type="button"
                  className="flex-1"
                  disabled={state === "working"}
                  onClick={() => { void runAction("accept"); }}
                >
                  Accept invitation
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={state === "working"}
                  onClick={() => { void runAction("decline"); }}
                >
                  Decline
                </Button>
              </div>
            </>
          ) : null}

          {state === "accepted" ? (
            <Button type="button" className="w-full" onClick={() => window.location.assign("/")}>Open workspace</Button>
          ) : null}
          {state === "declined" || state === "error" || (preview && preview.status !== "pending") ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => window.location.assign("/")}>Return to Nodes</Button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
