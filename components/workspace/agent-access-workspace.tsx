"use client";

import React from "react";
import { ArrowLeft, CheckCircle2, Copy, KeyRound, RefreshCw } from "lucide-react";
import { useWorkspaceSurface } from "@/components/context/workspace-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_AGENT_TOKEN_LIFETIME_DAYS,
  MAX_AGENT_TOKEN_LIFETIME_DAYS,
} from "@/lib/agent-tokens";

const workspaceBackdropClassName =
  "flex flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(11,13,19,0.92),rgba(9,11,16,0.98))]";
const shellClassName =
  "h-full min-h-0 overflow-hidden rounded-[20px] border border-border/80 bg-card/94 shadow-[0_20px_54px_-38px_rgba(0,0,0,0.7)] backdrop-blur-md";
const shellInnerClassName =
  "h-full min-h-0 overflow-auto rounded-[18px] bg-background/92 p-5 md:p-6";

type MintResponse = {
  saved: boolean;
  token: string;
  tokenId: string;
  label: string | null;
  expiresAt: string;
};

const padDatePart = (value: number) => String(value).padStart(2, "0");

const formatLocalDateTimeInputValue = (date: Date) =>
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;

const createDefaultExpiryInput = () =>
  formatLocalDateTimeInputValue(
    new Date(Date.now() + DEFAULT_AGENT_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000),
  );

export function AgentAccessWorkspace() {
  const { showAgentWork, showWorkspace } = useWorkspaceSurface();
  const [busy, setBusy] = React.useState(false);
  const [expiryInput, setExpiryInput] = React.useState<string>(createDefaultExpiryInput);
  const [label, setLabel] = React.useState<string>("");
  const [saved, setSaved] = React.useState<boolean | null>(null);
  const [token, setToken] = React.useState<string>("");
  const [tokenId, setTokenId] = React.useState<string>("");
  const [expiresAt, setExpiresAt] = React.useState<string>("");
  const [error, setError] = React.useState<string>("");

  const mint = React.useCallback(async () => {
    const parsedExpiry = new Date(expiryInput);
    if (Number.isNaN(parsedExpiry.getTime())) {
      setError("Pick a valid expiry date and time.");
      return;
    }

    setBusy(true);
    setError("");
    setSaved(null);
    try {
      const res = await fetch("/api/agents/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt: parsedExpiry.toISOString(), label }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Request failed: ${res.status}`);
      }
      const data = (await res.json()) as MintResponse;
      setSaved(data.saved);
      setToken(data.token);
      setTokenId(data.tokenId);
      setExpiresAt(data.expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create agent token.");
    } finally {
      setBusy(false);
    }
  }, [expiryInput, label]);

  const copy = React.useCallback(async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      // ignore clipboard failures
    }
  }, [token]);

  return (
    <div className={workspaceBackdropClassName}>
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60 text-foreground">
            <KeyRound className="size-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Agent Access</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a token for automations to call your Nodes APIs.
            </p>
          </div>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={showWorkspace}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className={shellClassName}>
          <div className={shellInnerClassName}>
            <section className="rounded-[18px] border border-border/80 bg-card/88 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">Mint Agent Token</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tokens are encrypted and expire automatically. Treat them like a password.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={mint}>
                  <RefreshCw className="size-4" />
                  {token ? "Rotate" : "Create"}
                </Button>
              </div>

              {error ? (
                <p className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              ) : null}

              <div className="mt-4 space-y-2">
                <label
                  className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
                  htmlFor="agent-token-label"
                >
                  Label (optional)
                </label>
                <Input
                  id="agent-token-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="e.g. GitHub bot, nightly agent…"
                />
              </div>

              <div className="mt-4 space-y-2">
                <label
                  className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
                  htmlFor="agent-token-expiry"
                >
                  Expiry date
                </label>
                <Input
                  id="agent-token-expiry"
                  type="datetime-local"
                  value={expiryInput}
                  onChange={(event) => setExpiryInput(event.target.value)}
                  min={formatLocalDateTimeInputValue(new Date(Date.now() + 60_000))}
                />
                <p className="text-xs text-muted-foreground">
                  Choose the exact local expiry time. Tokens can expire up to {MAX_AGENT_TOKEN_LIFETIME_DAYS} days ahead.
                </p>
              </div>

              <div className="mt-4 space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Token
                </label>
                <div className="flex gap-2">
                  <Input readOnly value={token} placeholder="Create a token to see it here…" />
                  <Button type="button" variant="outline" size="icon" disabled={!token} onClick={copy} aria-label="Copy token">
                    <Copy className="size-4" />
                  </Button>
                </div>
                {expiresAt ? (
                  <p className="text-xs text-muted-foreground">Expires at {expiresAt}</p>
                ) : null}
              </div>

              {saved === true ? (
                <div className="mt-4 rounded-[16px] border border-emerald-500/25 bg-emerald-500/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                        <CheckCircle2 className="size-4" />
                        Token saved to Agent Work
                      </p>
                      <p className="mt-1 break-all text-xs text-emerald-800/90">
                        Token id {tokenId}
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={showAgentWork}>
                      Open Agent Work
                    </Button>
                  </div>
                </div>
              ) : null}

              {saved === false ? (
                <div className="mt-4 rounded-[16px] border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-800">
                  Token created, but Agent Work storage did not confirm the save. The token may still work, but it will not be manageable from the dashboard until storage is available.
                </div>
              ) : null}

                <div className="mt-5 rounded-[16px] border border-border/70 bg-background/70 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    How to use
                  </p>
                  <p className="mt-2 text-sm text-foreground/90">
                    Send the token as a Bearer credential:
                  </p>
                  <pre className="mt-2 overflow-auto rounded-xl border border-border/70 bg-muted/40 p-3 text-xs text-foreground">
{`Authorization: Bearer <agent-token>`}
                  </pre>
                  <p className="mt-3 text-sm text-foreground/90">
                    To have agent messages show up inside Nodes sessions, call:
                  </p>
                  <pre className="mt-2 overflow-auto rounded-xl border border-border/70 bg-muted/40 p-3 text-xs text-foreground">
{`POST /api/agents/chat

{
  "sessionId": "<session-id>",
  "prompt": "Ask Nemotron something…",
  "provider": "openrouter",
  "model": "openrouter/free",
  "historyMode": "full"
}`}
                  </pre>
                </div>
              </section>
            </div>
          </div>
        </div>
    </div>
  );
}
