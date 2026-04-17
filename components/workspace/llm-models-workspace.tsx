"use client";

import { ArrowLeft, Bot, Check, KeyRound, Plus, Server, Sparkles, X } from "lucide-react";
import React from "react";
import { useLlmSettings } from "@/components/context/llm-settings";
import { useWorkspaceSurface } from "@/components/context/workspace-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProviderDefinition,
  getProviderLabel,
  OPENROUTER_FREE_MODEL_OPTIONS,
} from "@/lib/llm/provider-catalog";

const workspaceBackdropClassName =
  "flex flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(11,13,19,0.92),rgba(9,11,16,0.98))]";
const shellClassName =
  "h-full min-h-0 overflow-hidden rounded-[20px] border border-border/80 bg-card/94 shadow-[0_20px_54px_-38px_rgba(0,0,0,0.7)] backdrop-blur-md";
const shellInnerClassName =
  "h-full min-h-0 overflow-auto rounded-[18px] bg-background/92 p-5 md:p-6";

function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={shellClassName}>
      <div className={shellInnerClassName}>{children}</div>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[18px] border border-border/80 bg-card/88 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${className}`}
    >
      {children}
    </section>
  );
}

function ProviderHeader({
  action,
  icon,
  provider,
  subtitle,
}: {
  action?: React.ReactNode;
  icon: React.ReactNode;
  provider: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60 text-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">{provider}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {action}
        </div>
      </div>
    </div>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function OllamaCard() {
  const { settings, setProviderEnabled, setProviderModels, setProviderValue } = useLlmSettings();
  const ollama = settings.providers.ollama;
  const definition = getProviderDefinition("ollama");

  return (
    <Card>
      <ProviderHeader
        action={
          <Button
            type="button"
            size="sm"
            variant={ollama.enabled ? "default" : "outline"}
            onClick={() => setProviderEnabled("ollama", !ollama.enabled)}
          >
            {ollama.enabled ? "Enabled" : "Disabled"}
          </Button>
        }
        icon={<Server className="size-4" />}
        provider={definition.label}
        subtitle={definition.description}
      />
      <div className="mt-5 space-y-4">
        <Field label="Base URL">
          <Input
            value={ollama.baseUrl}
            placeholder={definition.modelHint}
            onChange={(event) => setProviderValue("ollama", "baseUrl", event.currentTarget.value)}
          />
        </Field>
        <Field label="Models">
          <Input
            value={ollama.models.join(", ")}
            placeholder={definition.modelHint}
            onChange={(event) => setProviderModels("ollama", event.currentTarget.value)}
          />
        </Field>
      </div>
    </Card>
  );
}

function OpenRouterKeyCard() {
  const {
    addOpenRouterApiKey,
    clearProviderApiKey,
    policy,
    removeOpenRouterApiKey,
    setActiveOpenRouterApiKey,
    settings,
  } = useLlmSettings();
  const openrouter = settings.providers.openrouter;
  const requireUserKey = policy.openrouter.requireUserKey;
  const hasDeploymentKey = policy.openrouter.hasDeploymentKey;
  const definition = getProviderDefinition("openrouter");
  const [draftName, setDraftName] = React.useState("");
  const [draftKey, setDraftKey] = React.useState("");

  const keys = openrouter.apiKeys ?? [];
  const activeKeyId = openrouter.activeApiKeyId ?? keys[0]?.id ?? null;
  const activeKey = keys.find((entry) => entry.id === activeKeyId) ?? null;
  const statusLabel = keys.length > 0
    ? `${keys.length} saved`
    : requireUserKey
      ? "Required"
      : hasDeploymentKey
        ? "Optional"
        : "Missing";

  const statusTone = keys.length > 0
    ? "border-emerald-400/30 bg-emerald-500/10 text-foreground"
    : requireUserKey
      ? "border-amber-400/30 bg-amber-500/10 text-foreground"
      : "border-border/80 bg-background text-muted-foreground";

  return (
    <Card className="lg:col-span-2">
      <ProviderHeader
        icon={<KeyRound className="size-4" />}
        provider={`${definition.label} API key`}
        subtitle="Stored on the server. Never shown again after saving."
        action={
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-medium ${statusTone}`}
          >
            {keys.length > 0 ? <Check className="size-3.5" /> : null}
            {statusLabel}
          </span>
        }
      />

      <div className="mt-5 space-y-3">
        <div className="grid gap-2 md:grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)_auto]">
          <Input
            value={draftName}
            placeholder="Key name (optional)"
            onChange={(event) => setDraftName(event.currentTarget.value)}
          />
          <Input
            type="password"
            value={draftKey}
            placeholder="Paste OpenRouter API key"
            onChange={(event) => setDraftKey(event.currentTarget.value)}
          />
          <Button
            type="button"
            onClick={() => {
              const trimmed = draftKey.trim();
              if (!trimmed) return;
              addOpenRouterApiKey(draftName, trimmed);
              setDraftName("");
              setDraftKey("");
            }}
          >
            Add key
          </Button>
        </div>

        {keys.length > 0 ? (
          <div className="space-y-2">
            {keys.map((entry) => {
              const isActive = entry.id === activeKeyId;
              return (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {isActive ? "Active key for OpenRouter requests" : "Saved key"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      onClick={() => setActiveOpenRouterApiKey(entry.id)}
                    >
                      {isActive ? "Active" : "Set active"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => removeOpenRouterApiKey(entry.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {keys.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => clearProviderApiKey("openrouter")}>
              Delete all keys
            </Button>
            <span className="text-xs text-muted-foreground">
              Active: {activeKey?.name ?? "none"}
            </span>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {requireUserKey
            ? "This deployment requires a user key to use OpenRouter."
            : hasDeploymentKey
              ? "This deployment may use a shared key when you don't add one."
              : "Add one or more keys to use OpenRouter."}
        </p>
      </div>
    </Card>
  );
}

function OpenRouterModelsCard() {
  const {
    addOpenRouterCustomModel,
    policy,
    removeOpenRouterCustomModel,
    settings,
    toggleOpenRouterModel,
  } = useLlmSettings();
  const openrouter = settings.providers.openrouter;
  const requireUserKey = policy.openrouter.requireUserKey;
  const definition = getProviderDefinition("openrouter");
  const [customDraft, setCustomDraft] = React.useState("");

  const addFromDraft = React.useCallback(() => {
    const entries = customDraft
      .split(/[\n,]+/g)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (entries.length === 0) return;
    for (const entry of entries) {
      addOpenRouterCustomModel(entry);
    }
    setCustomDraft("");
  }, [addOpenRouterCustomModel, customDraft]);

  return (
    <Card className="lg:col-span-2">
      <ProviderHeader
        icon={<Sparkles className="size-4" />}
        provider={definition.label}
        subtitle={definition.description}
      />
      <div className="mt-5">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Free models in selector
          </span>
          <div className="flex flex-wrap gap-2">
            {OPENROUTER_FREE_MODEL_OPTIONS.map((option) => {
              const active = openrouter.enabledModels.includes(option.modelId);
              return (
                <button
                  key={option.modelId}
                  type="button"
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-primary/35 bg-primary/12 text-foreground"
                      : "border-border/80 bg-background text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => toggleOpenRouterModel(option.modelId)}
                >
                  {option.label.replace(/^OpenRouter · /, "")}
                </button>
              );
            })}
          </div>
          {requireUserKey ? (
            <p className="text-xs text-muted-foreground">
              OpenRouter requests require a user API key. Add one in the API Keys tab.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Custom OpenRouter models
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add any OpenRouter model id (paid or free). Billing is tied to your own API key.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            value={customDraft}
            placeholder="e.g. anthropic/claude-3.5-sonnet"
            onChange={(event) => setCustomDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addFromDraft();
            }}
            className="min-w-72"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={addFromDraft}
          >
            <Plus className="size-4" />
            Add model
          </Button>
        </div>

        {(openrouter.customModels ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {(openrouter.customModels ?? []).map((modelId) => (
              <span
                key={modelId}
                className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/85 px-3 py-1.5 text-xs font-medium text-foreground"
              >
                {modelId}
                <button
                  type="button"
                  className="ml-1 inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${modelId}`}
                  onClick={() => removeOpenRouterCustomModel(modelId)}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No custom models yet. Add one to make it appear in the top model selector.
          </p>
        )}
      </div>
    </Card>
  );
}

export function LlmModelsWorkspace() {
  const {
    availableModelOptions,
    isReady,
    settings,
  } = useLlmSettings();
  const { showWorkspace } = useWorkspaceSurface();
  const [tab, setTab] = React.useState<"models" | "keys">("models");

  const enabledProviderCount = React.useMemo(
    () =>
      [
        settings.providers.openrouter.enabledModels.length > 0,
        settings.providers.ollama.enabled,
      ].filter(Boolean).length,
    [settings],
  );

  return (
    <div className={`${workspaceBackdropClassName} px-4 py-4 md:px-5 md:py-5`}>
      <WorkspaceShell>
        <div className="flex min-h-0 flex-col gap-5">
          <div className="flex flex-wrap items-start gap-3">
            <Button type="button" variant="outline" size="sm" onClick={showWorkspace}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Profile
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-foreground">LLM Models</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick the models exposed in the selector and manage provider connections per user.
              </p>
              {!isReady ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Syncing your saved model settings…
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-full border border-border/70 bg-muted/55 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                {availableModelOptions.length} models ready
              </div>
              <div className="rounded-full border border-border/70 bg-muted/55 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                {enabledProviderCount} providers live
              </div>
            </div>
          </div>

          {!isReady ? (
            <Card>
              <p className="text-sm text-muted-foreground">
                Loading your saved provider connections and model list.
              </p>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={tab === "models" ? "default" : "outline"}
                  onClick={() => setTab("models")}
                >
                  Models
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={tab === "keys" ? "default" : "outline"}
                  onClick={() => setTab("keys")}
                >
                  API Keys
                </Button>
              </div>

              {tab === "keys" ? <OpenRouterKeyCard /> : <OpenRouterModelsCard />}

              <div className="grid gap-4 xl:grid-cols-2">
                <OllamaCard />
                <Card>
                  <ProviderHeader
                    icon={<Bot className="size-4" />}
                    provider="Selector"
                    subtitle="Only usable models appear in the top model selector."
                  />
                  <div className="mt-5 flex flex-wrap gap-2">
                    {availableModelOptions.map((option) => (
                      <span
                        key={`${option.provider}:${option.modelId}`}
                        className="rounded-full border border-border/80 bg-background/85 px-3 py-1.5 text-xs font-medium text-foreground"
                      >
                        {option.label.replace(`${getProviderLabel(option.provider)} · `, "")}
                      </span>
                    ))}
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      </WorkspaceShell>
    </div>
  );
}
