"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectDocument, ProjectCollaboratorRole } from "@/lib/project-documents";
import type { ProjectInvitation } from "@/lib/project-invitations";

type ProjectResponse = { project: ProjectDocument };
type InvitationsResponse = { invitations: ProjectInvitation[] };
type CreateResponse = ProjectResponse & {
  invitation: ProjectInvitation;
  inviteUrl: string;
};

const jsonRequest = async <T,>(input: RequestInfo | URL, init?: RequestInit) => {
  const response = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
};

const formatDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch { return value; }
};

export function ProjectCollaborationManager({ projectId }: { projectId: string }) {
  const [project, setProject] = React.useState<ProjectDocument | null>(null);
  const [invitations, setInvitations] = React.useState<ProjectInvitation[]>([]);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<ProjectCollaboratorRole>("viewer");
  const [latestLink, setLatestLink] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("Loading collaboration settings...");
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [projectData, invitationData] = await Promise.all([
      jsonRequest<ProjectResponse>(`/api/projects/${projectId}`),
      jsonRequest<InvitationsResponse>(`/api/projects/${projectId}/invitations`),
    ]);
    setProject(projectData.project);
    setInvitations(invitationData.invitations);
    setMessage("Invitations are single-use and expire automatically.");
  }, [projectId]);

  React.useEffect(() => {
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load collaboration settings."));
  }, [refresh]);

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Invitation link copied to the clipboard.");
    } catch {
      window.prompt("Copy this invitation link", link);
    }
  };

  const createInvitation = async () => {
    setBusy(true);
    setLatestLink(null);
    try {
      const data = await jsonRequest<CreateResponse>(`/api/projects/${projectId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setProject(data.project);
      setEmail("");
      setLatestLink(data.inviteUrl);
      await refresh();
      setLatestLink(data.inviteUrl);
      setMessage(`Invitation created for ${data.invitation.inviteeEmail}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create invitation.");
    } finally {
      setBusy(false);
    }
  };

  const revokeInvitation = async (invitation: ProjectInvitation) => {
    setBusy(true);
    try {
      const data = await jsonRequest<ProjectResponse>(
        `/api/projects/${projectId}/invitations/${invitation.id}`,
        { method: "DELETE" },
      );
      setProject(data.project);
      await refresh();
      setMessage(`Invitation for ${invitation.inviteeEmail} revoked.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke invitation.");
    } finally { setBusy(false); }
  };

  const updateMember = async (memberEmail: string, memberRole: ProjectCollaboratorRole) => {
    setBusy(true);
    try {
      const data = await jsonRequest<ProjectResponse>(`/api/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: memberEmail, role: memberRole }),
      });
      setProject(data.project);
      setMessage(`${memberEmail} is now ${memberRole}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update member role.");
    } finally { setBusy(false); }
  };

  const removeMember = async (memberEmail: string) => {
    setBusy(true);
    try {
      const data = await jsonRequest<ProjectResponse>(`/api/projects/${projectId}/members`, {
        method: "DELETE",
        body: JSON.stringify({ email: memberEmail }),
      });
      setProject(data.project);
      await refresh();
      setMessage(`${memberEmail} removed from the project.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove member.");
    } finally { setBusy(false); }
  };

  if (!project) {
    return <main className="mx-auto max-w-4xl px-4 py-12 text-sm text-muted-foreground">{message}</main>;
  }

  const acceptedMembers = project.members.filter((member) => member.status === "accepted");
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Project collaboration</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">{project.title?.trim() || "Untitled Project"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => window.location.assign("/")}>Back to workspace</Button>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Create invitation</h2>
        <p className="mt-1 text-sm text-muted-foreground">Creating another invitation for the same email revokes the previous link.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input aria-label="Invitation email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder="person@example.com" />
          <select aria-label="Invitation role" value={role} onChange={(event) => setRole(event.currentTarget.value as ProjectCollaboratorRole)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <Button type="button" disabled={busy || !email.trim()} onClick={() => { void createInvitation(); }}>Create link</Button>
        </div>
        {latestLink ? (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
            <p className="break-all text-xs text-foreground">{latestLink}</p>
            <Button type="button" size="sm" className="mt-3" onClick={() => { void copyLink(latestLink); }}>Copy invitation link</Button>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Pending invitations</h2>
        <div className="mt-4 space-y-3">
          {pendingInvitations.length === 0 ? <p className="text-sm text-muted-foreground">No pending invitations.</p> : pendingInvitations.map((invitation) => (
            <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
              <div>
                <p className="font-medium">{invitation.inviteeEmail}</p>
                <p className="text-xs text-muted-foreground">{invitation.role} · expires {formatDate(invitation.expiresAt)}</p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { void revokeInvitation(invitation); }}>Revoke</Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Accepted members</h2>
        <div className="mt-4 space-y-3">
          {acceptedMembers.length === 0 ? <p className="text-sm text-muted-foreground">No accepted collaborators.</p> : acceptedMembers.map((member) => (
            <div key={member.email} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
              <div>
                <p className="font-medium">{member.email}</p>
                <p className="text-xs text-muted-foreground">Accepted {formatDate(member.acceptedAt ?? member.addedAt)}</p>
              </div>
              <div className="flex gap-2">
                <select aria-label={`Role for ${member.email}`} value={member.role} disabled={busy} onChange={(event) => { void updateMember(member.email, event.currentTarget.value as ProjectCollaboratorRole); }} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { void removeMember(member.email); }}>Remove</Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
