"use client";

import { ArrowLeft, Bot, Server, Sparkles } from "lucide-react";
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

function OpenRouterCard() {
  const { clearProviderApiKey, policy, settings, setProviderApiKey, toggleOpenRouterModel } =
    useLlmSettings();
  const openrouter = settings.providers.openrouter;
  const requireUserKey = policy.openrouter.requireUserKey;
  const hasDeploymentKey = policy.openrouter.hasDeploymentKey;
  const definition = getProviderDefinition("openrouter");

  return (
    <Card className="lg:col-span-2">
      <ProviderHeader
        icon={<Sparkles className="size-4" />}
        provider={definition.label}
        subtitle={definition.description}
      />
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <Field label={definition.settingsLabel}>
          <div className="space-y-2">
            <Input
              type="password"
              value={openrouter.apiKey}
              placeholder={
                openrouter.hasApiKey
                  ? "Saved on the server. Type a new key to replace it."
                  : requireUserKey
                    ? "Paste your OpenRouter API key. It is stored on the server and never shown again."
                    : hasDeploymentKey
                      ? "Optional. Paste your OpenRouter API key to override the shared key."
                      : "Paste your OpenRouter API key. It is stored on the server and never shown again."
              }
              onChange={(event) => setProviderApiKey("openrouter", event.currentTarget.value)}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {openrouter.hasApiKey
                  ? "Using your saved key (stored server-side)."
                  : requireUserKey
                    ? "This deployment requires a user API key (stored server-side)."
                    : hasDeploymentKey
                      ? "A shared deployment key may be used when you don't add one."
                      : "Add a key to use OpenRouter."}
              </span>
              {openrouter.hasApiKey ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => clearProviderApiKey("openrouter")}
                >
                  Clear saved key
                </Button>
              ) : null}
            </div>
          </div>
        </Field>
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
        </div>
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
                Pick the models exposed in the selector and add provider credentials per user.
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
              <OpenRouterCard />

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
