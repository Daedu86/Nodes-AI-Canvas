"use client";

import * as React from "react";
import { useAssistantRuntime } from "@assistant-ui/react";
import { BracesIcon, FileStackIcon, GaugeIcon, PanelRightOpenIcon } from "lucide-react";
import { useHistoryMode } from "@/components/context/history-mode";
import { useModelConfig } from "@/components/context/model-config";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import { useSessionArtifacts } from "@/components/context/session-artifacts";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatBytes, getByteBudgetStatus, getContextBudgetPolicy } from "@/lib/context-budget";
import { buildContextArtifactsBlock } from "@/lib/llm/context-builder";
import { findModelOption } from "@/lib/model-options";
import {
  buildActiveBranchContext,
  getBudgetStatus,
  getStoredSessionDocumentStats,
} from "@/lib/session-context";
import { toLlmContextArtifacts } from "@/lib/session-artifacts";

const statusClasses: Record<string, string> = {
  healthy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  over: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

type BlobMaintenance = {
  deduplicatedBlobLinks: number;
  orphanBlobCount: number;
  orphanBytes: number;
  referencedBlobCount: number;
  referencedBlobLinks: number;
  referencedBytes: number;
  totalBlobCount: number;
  totalBytes: number;
  uniqueReferencedBlobCount: number;
};

type BlobMaintenanceResponse = {
  maintenance: BlobMaintenance;
};

type BlobCleanupResponse = {
  cleanup: {
    deletedBlobCount: number;
    deletedBytes: number;
    maintenance: BlobMaintenance;
  };
};

const StatCard = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

export function SessionContextSheet() {
  const runtime = useAssistantRuntime();
  const { historyMode } = useHistoryMode();
  const { modelId, provider } = useModelConfig();
  const { activeSession } = usePersistedSessions();
  const { artifacts, contextLinks } = useSessionArtifacts();
  const [open, setOpen] = React.useState(false);
  const [blobMaintenance, setBlobMaintenance] = React.useState<BlobMaintenance | null>(null);
  const [blobMaintenanceBusy, setBlobMaintenanceBusy] = React.useState(false);
  const [blobMaintenanceError, setBlobMaintenanceError] = React.useState<string | null>(null);
  const [blobCleanupMessage, setBlobCleanupMessage] = React.useState<string | null>(null);

  const activeThreadMessages = React.useMemo(
    () => runtime?.threads?.main?.getState().messages ?? [],
    [runtime],
  );
  const activeBranchContext = React.useMemo(
    () => buildActiveBranchContext(activeThreadMessages, historyMode),
    [activeThreadMessages, historyMode],
  );
  const sessionTreeStats = React.useMemo(
    () =>
      activeSession
        ? getStoredSessionDocumentStats({
            ...activeSession,
            artifacts,
            contextLinks,
          })
        : null,
    [activeSession, artifacts, contextLinks],
  );
  const budget = React.useMemo(() => getContextBudgetPolicy({ modelId, provider }), [modelId, provider]);
  const payloadStatus = getBudgetStatus(
    activeBranchContext.payloadMetrics.estimatedTokens,
    budget.recommendedPromptTokens,
  );
  const storedStatus = getByteBudgetStatus(
    sessionTreeStats?.bytes ?? 0,
    budget.warnSessionBytes,
    budget.hardSessionBytes,
  );
  const artifactBudget = React.useMemo(
    () => buildContextArtifactsBlock(toLlmContextArtifacts(artifacts), { modelId, provider }),
    [artifacts, modelId, provider],
  );
  const modelLabel = findModelOption({ modelId, provider }).label;
  const currentModeHint = historyMode === "full" ? "The model receives the active branch transcript." : "The model receives only the latest user message.";

  const loadBlobMaintenance = React.useCallback(async () => {
    setBlobMaintenanceBusy(true);
    setBlobMaintenanceError(null);
    try {
      const response = await fetch("/api/sessions/blob-maintenance");
      if (!response.ok) {
        throw new Error(`Failed to load blob maintenance stats: ${response.status}`);
      }
      const data = (await response.json()) as BlobMaintenanceResponse;
      setBlobMaintenance(data.maintenance);
    } catch (error) {
      setBlobMaintenanceError(
        error instanceof Error ? error.message : "Failed to load blob maintenance stats.",
      );
    } finally {
      setBlobMaintenanceBusy(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void loadBlobMaintenance();
  }, [activeSession?.id, loadBlobMaintenance, open]);

  const handleCleanupBlobStore = React.useCallback(async () => {
    setBlobMaintenanceBusy(true);
    setBlobMaintenanceError(null);
    setBlobCleanupMessage(null);
    try {
      const response = await fetch("/api/sessions/blob-maintenance", { method: "POST" });
      if (!response.ok) {
        throw new Error(`Failed to clean blob store: ${response.status}`);
      }
      const data = (await response.json()) as BlobCleanupResponse;
      setBlobMaintenance(data.cleanup.maintenance);
      setBlobCleanupMessage(
        data.cleanup.deletedBlobCount > 0
          ? `Removed ${data.cleanup.deletedBlobCount} orphan blob(s), freeing ${formatBytes(data.cleanup.deletedBytes)}.`
          : "No orphan blobs found. Blob store is already clean.",
      );
    } catch (error) {
      setBlobMaintenanceError(
        error instanceof Error ? error.message : "Failed to clean blob store.",
      );
    } finally {
      setBlobMaintenanceBusy(false);
    }
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <PanelRightOpenIcon className="h-4 w-4" />
          <span>Context</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[92vw] gap-0 sm:max-w-2xl">
        <SheetHeader className="border-b pb-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 p-2 text-sky-700">
              <GaugeIcon className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <SheetTitle>Session Context</SheetTitle>
              <SheetDescription>
                Inspect the current branch context, the exact payload shape selected by{" "}
                <span className="font-medium uppercase">{historyMode}</span>, and the stored
                session tree footprint.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <StatCard
              label="Current Mode"
              value={historyMode === "full" ? "Full context" : "Last message"}
              hint={currentModeHint}
            />
            <StatCard label="Active Model" value={modelLabel} hint={provider} />
            <StatCard
              label="Payload Tokens"
              value={String(activeBranchContext.payloadMetrics.estimatedTokens)}
              hint={`${activeBranchContext.payloadMetrics.messageCount} message(s) in the actual prompt payload`}
            />
            <StatCard
              label="Payload Size"
              value={formatBytes(activeBranchContext.payloadMetrics.bytes)}
              hint={`${activeBranchContext.payloadMetrics.megabytes.toFixed(3)} MB of transcript text`}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-border/60 bg-background/90 px-4 py-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{budget.label}</p>
              <span
                className={`rounded-full border px-2 py-1 text-[11px] font-medium ${statusClasses[payloadStatus]}`}
              >
                {activeBranchContext.payloadMetrics.estimatedTokens} / {budget.recommendedPromptTokens} estimated tokens
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{budget.note}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1">
                max {budget.maxArtifactsPerPrompt} artifacts per prompt
              </span>
              <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1">
                artifact budget {budget.maxArtifactTokensPerPrompt} tokens
              </span>
              <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1">
                max {budget.maxCharsPerArtifact.toLocaleString()} chars per artifact
              </span>
              <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1">
                image upload cap {formatBytes(budget.maxUploadImageBytes)}
              </span>
              <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1">
                file upload cap {formatBytes(budget.maxUploadFileBytes)}
              </span>
              <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1">
                previews up to {formatBytes(budget.maxImagePreviewBytes)} / {budget.maxImagePreviewDimension}px
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            <section className="rounded-2xl border border-border/60 bg-background/90 shadow-sm">
              <div className="border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <GaugeIcon className="h-4 w-4 text-sky-700" />
                  <div>
                    <h3 className="text-sm font-semibold">Current LLM Payload</h3>
                    <p className="text-xs text-muted-foreground">
                      This is what the model sees right now with <span className="font-medium uppercase">{historyMode}</span>.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard label="Messages" value={String(activeBranchContext.payloadMetrics.messageCount)} />
                  <StatCard label="Estimated Tokens" value={String(activeBranchContext.payloadMetrics.estimatedTokens)} />
                  <StatCard label="Weight" value={formatBytes(activeBranchContext.payloadMetrics.bytes)} />
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/40 p-3 text-xs leading-6 text-foreground/85">
                  {activeBranchContext.payloadMetrics.text || "No payload would be sent for the current state."}
                </pre>
              </div>
            </section>

            <section className="rounded-2xl border border-border/60 bg-background/90 shadow-sm">
              <div className="border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <GaugeIcon className="h-4 w-4 text-violet-700" />
                  <div>
                    <h3 className="text-sm font-semibold">Artifact Context Budget</h3>
                    <p className="text-xs text-muted-foreground">
                      Workspace artifact preview. Branch-specific attachment still decides which artifacts actually travel with a prompt.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <StatCard label="Stored Artifacts" value={String(artifacts.length)} />
                  <StatCard label="Included" value={String(artifactBudget.includedArtifacts.length)} />
                  <StatCard label="Excluded" value={String(artifactBudget.excludedArtifacts.length)} />
                  <StatCard
                    label="Truncated"
                    value={String(artifactBudget.includedArtifacts.filter((artifact) => artifact.truncated).length)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard label="Artifact Tokens" value={String(artifactBudget.estimatedTokens)} />
                  <StatCard label="Artifact Weight" value={formatBytes(artifactBudget.bytes)} />
                  <StatCard
                    label="Budget"
                    value={`${artifactBudget.policy.maxArtifactTokensPerPrompt} tokens`}
                    hint={`${artifactBudget.policy.maxArtifactsPerPrompt} artifact(s) max`}
                  />
                </div>
                {artifactBudget.decisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No workspace artifacts stored in this session yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {artifactBudget.decisions.map((decision) => (
                      <div
                        key={decision.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              {decision.artifactType}
                            </span>
                            <span className="truncate text-sm font-medium text-foreground">{decision.title}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{decision.reasonLabel}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1">
                            {decision.estimatedTokens} tokens
                          </span>
                          <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1">
                            {decision.includedChars}/{decision.originalChars} chars
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/40 p-3 text-xs leading-6 text-foreground/85">
                  {artifactBudget.block || "No artifact context would be appended under the current policy."}
                </pre>
              </div>
            </section>

            <section className="rounded-2xl border border-border/60 bg-background/90 shadow-sm">
              <div className="border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileStackIcon className="h-4 w-4 text-sky-700" />
                  <div>
                    <h3 className="text-sm font-semibold">Full Active Branch</h3>
                    <p className="text-xs text-muted-foreground">
                      The current branch transcript stored in the runtime. Other saved branches are not sent unless you switch to them.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard label="Messages" value={String(activeBranchContext.fullMetrics.messageCount)} />
                  <StatCard label="Estimated Tokens" value={String(activeBranchContext.fullMetrics.estimatedTokens)} />
                  <StatCard label="Weight" value={formatBytes(activeBranchContext.fullMetrics.bytes)} />
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/40 p-3 text-xs leading-6 text-foreground/85">
                  {activeBranchContext.fullMetrics.text || "The active branch is empty."}
                </pre>
              </div>
            </section>

            <section className="rounded-2xl border border-border/60 bg-background/90 shadow-sm">
              <div className="border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <BracesIcon className="h-4 w-4 text-sky-700" />
                  <div>
                    <h3 className="text-sm font-semibold">Stored Session Tree</h3>
                    <p className="text-xs text-muted-foreground">
                      Everything persisted in this session, including branches, artifacts, and context links that are not currently feeding the model.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard label="Messages" value={String(sessionTreeStats?.messageCount ?? 0)} />
                  <StatCard label="Branch Groups" value={String(sessionTreeStats?.siblingGroups ?? 0)} />
                  <StatCard label="Stored Weight" value={formatBytes(sessionTreeStats?.bytes ?? 0)} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-1 text-[11px] font-medium ${statusClasses[storedStatus]}`}
                  >
                    session size {formatBytes(sessionTreeStats?.bytes ?? 0)} / warning {formatBytes(budget.warnSessionBytes)}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard label="User Messages" value={String(sessionTreeStats?.userCount ?? 0)} />
                  <StatCard label="Assistant Messages" value={String(sessionTreeStats?.assistantCount ?? 0)} />
                  <StatCard label="Root Branches" value={String(sessionTreeStats?.rootCount ?? 0)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard label="Artifacts" value={String(sessionTreeStats?.artifactCount ?? 0)} />
                  <StatCard label="Context Links" value={String(sessionTreeStats?.contextLinkCount ?? 0)} />
                  <StatCard label="Stored MB" value={`${(sessionTreeStats?.megabytes ?? 0).toFixed(3)} MB`} />
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">Blob Store Hygiene</p>
                      <p className="text-xs text-muted-foreground">
                        Uploaded originals live outside the session JSON. This tool shows deduplicated storage and removes orphaned blobs.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={blobMaintenanceBusy || (blobMaintenance?.orphanBlobCount ?? 0) === 0}
                      onClick={() => void handleCleanupBlobStore()}
                    >
                      {blobMaintenanceBusy ? "Cleaning..." : "Clean orphan blobs"}
                    </Button>
                  </div>
                  {blobMaintenanceError ? (
                    <p className="mt-3 text-xs text-rose-700">{blobMaintenanceError}</p>
                  ) : null}
                  {blobCleanupMessage ? (
                    <p className="mt-3 text-xs text-emerald-700">{blobCleanupMessage}</p>
                  ) : null}
                  {blobMaintenance ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      <StatCard label="Stored Blobs" value={String(blobMaintenance.totalBlobCount)} />
                      <StatCard label="Referenced" value={String(blobMaintenance.referencedBlobCount)} />
                      <StatCard label="Orphaned" value={String(blobMaintenance.orphanBlobCount)} />
                      <StatCard label="Deduped Links" value={String(blobMaintenance.deduplicatedBlobLinks)} />
                      <StatCard label="Blob Weight" value={formatBytes(blobMaintenance.totalBytes)} />
                      <StatCard label="Referenced Weight" value={formatBytes(blobMaintenance.referencedBytes)} />
                      <StatCard label="Orphan Weight" value={formatBytes(blobMaintenance.orphanBytes)} />
                      <StatCard label="Unique Refs" value={String(blobMaintenance.uniqueReferencedBlobCount)} />
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {blobMaintenanceBusy ? "Scanning blob store..." : "Open this panel to inspect blob store usage."}
                    </p>
                  )}
                </div>
                <details className="rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">
                    Show raw persisted session JSON
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-background p-3 text-xs leading-6 text-foreground/85">
                    {sessionTreeStats?.serialized ?? JSON.stringify(activeSession ?? {}, null, 2)}
                  </pre>
                </details>
              </div>
            </section>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
