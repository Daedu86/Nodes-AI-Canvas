import { NextResponse } from "next/server";
import { startCodexRun } from "@/lib/agents/codex/runner-client";
import type { CodexAgentRole, StartCodexRunInput } from "@/lib/agents/codex/types";
import { recordAgentEvent } from "@/lib/server/agent-work";
import { requireLocalApiUser } from "@/lib/server/request-guards";
import { getSession } from "@/lib/session-store";

export const runtime = "nodejs";
export const maxDuration = 60;

const ROLES = new Set<CodexAgentRole>([
  "coder",
  "reviewer",
  "researcher",
  "tester",
  "custom",
]);

const asOptionalString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const body = (await req.json().catch(() => null)) as Partial<StartCodexRunInput> | null;
  const sessionId = asOptionalString(body?.sessionId);
  const prompt = asOptionalString(body?.prompt);
  if (!sessionId || !prompt) {
    return NextResponse.json(
      { error: "Missing sessionId or prompt." },
      { status: 400 },
    );
  }

  const role = body?.role && ROLES.has(body.role) ? body.role : "coder";
  const projectId = asOptionalString(body?.projectId);
  const workspaceId = asOptionalString(body?.workspaceId);
  const cwd = asOptionalString(body?.cwd);
  const parentRunId = asOptionalString(body?.parentRunId);
  const label = asOptionalString(body?.label);
  const metadata =
    body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? body.metadata
      : undefined;

  const session = await getSession(sessionId, guarded.user.id).catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const actor = {
    tokenId: guarded.user.agentTokenId ?? null,
    label: guarded.user.agentLabel ?? "codex",
    ownerId: guarded.user.id,
  };

  await recordAgentEvent({
    actor,
    eventType: "codex.run.requested",
    method: "POST",
    route: "/api/agents/codex/runs",
    sessionId,
    projectId,
    payload: { cwd, label, parentRunId, role, workspaceId },
  });

  try {
    const run = await startCodexRun({
      ownerId: guarded.user.id,
      sessionId,
      projectId,
      prompt,
      workspaceId,
      cwd,
      parentRunId,
      role,
      label,
      metadata,
    });

    await recordAgentEvent({
      actor,
      eventType: "codex.run.started",
      method: "POST",
      route: "/api/agents/codex/runs",
      sessionId,
      projectId,
      payload: {
        agentId: run.agentId ?? null,
        parentRunId: run.parentRunId ?? parentRunId,
        role,
        runId: run.runId,
        status: run.status,
        threadId: run.threadId ?? null,
      },
    });

    return NextResponse.json(run, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Codex run.";
    await recordAgentEvent({
      actor,
      eventType: "codex.run.failed",
      method: "POST",
      route: "/api/agents/codex/runs",
      sessionId,
      projectId,
      payload: { message, parentRunId, role },
    });
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
