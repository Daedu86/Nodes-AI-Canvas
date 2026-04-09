"use client";

import { ArrowLeft, Bot, KeyRound, Server, Sparkles } from "lucide-react";
import React from "react";
import { useLlmSettings } from "@/components/context/llm-settings";
import { useWorkspaceSurface } from "@/components/context/workspace-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProviderDefinition,
  getProviderLabel,
  OPENROUTER_FREE_MODEL_OPTIONS,
  type LlmProviderId,
} from "@/lib/llm/provider-catalog";

const workspaceBackdropClassName =
  "flex flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.1),transparent_28%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.07),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.92),rgba(241,245,249,0.78))] dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.08),transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.94),rgba(2,6,23,0.82))]";
const shellClassName =
  "h-full min-h-0 overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.86))] shadow-[0_28px_90px_-48px_rgba(15,23,42,0.45)] ring-1 ring-black/[0.04] backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(15,23,42,0.82))] dark:ring-white/[0.03]";
const shellInnerClassName =
  "h-full min-h-0 overflow-auto rounded-[26px] bg-background/92 p-5 dark:bg-slate-950/80 md:p-6";

type EditableProviderCardProps = {
  apiKey: string;
  enabled: boolean;
  models: string[];
  onApiKeyChange: (value: string) => void;
  onEnabledChange: (value: boolean) => void;
  onModelsChange: (value: string) => void;
  provider: Exclude<LlmProviderId, "ollama" | "openrouter">;
};

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
      className={`rounded-[28px] border border-border/60 bg-white/85 p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.38)] dark:bg-slate-950/65 ${className}`}
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
      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-muted/50 text-foreground">
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

function EditableProviderCard({
  apiKey,
  enabled,
  models,
  onApiKeyChange,
  onEnabledChange,
  onModelsChange,
  provider,
}: EditableProviderCardProps) {
  const definition = getProviderDefinition(provider);

  return (
    <Card>
      <ProviderHeader
        action={
          <Button
            type="button"
            size="sm"
            variant={enabled ? "default" : "outline"}
            onClick={() => onEnabledChange(!enabled)}
          >
            {enabled ? "Enabled" : "Disabled"}
          </Button>
        }
        icon={<KeyRound className="size-4" />}
        provider={definition.label}
        subtitle={definition.description}
      />
      <div className="mt-5 space-y-4">
        <Field label={definition.settingsLabel}>
          <Input
            type="password"
            value={apiKey}
            placeholder="sk-..."
            onChange={(event) => onApiKeyChange(event.currentTarget.value)}
          />
        </Field>
        <Field label="Models">
          <Input
            value={models.join(", ")}
            placeholder={definition.modelHint}
            onChange={(event) => onModelsChange(event.currentTarget.value)}
          />
        </Field>
      </div>
    </Card>
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
  const { settings, setProviderApiKey, toggleOpenRouterModel } = useLlmSettings();
  const openrouter = settings.providers.openrouter;
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
          <Input
            type="password"
            value={openrouter.apiKey}
            placeholder="Optional. Deployment env key still works if this is empty."
            onChange={(event) => setProviderApiKey("openrouter", event.currentTarget.value)}
          />
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
                      ? "border-sky-300/80 bg-sky-500/10 text-foreground dark:border-sky-400/40"
                      : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
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
  const { availableModelOptions, settings, setProviderApiKey, setProviderEnabled, setProviderModels } =
    useLlmSettings();
  const { showWorkspace } = useWorkspaceSurface();

  const enabledProviderCount = React.useMemo(
    () =>
      [
        settings.providers.openrouter.enabledModels.length > 0,
        settings.providers.ollama.enabled,
        settings.providers.openai.enabled && settings.providers.openai.apiKey.trim().length > 0,
        settings.providers.anthropic.enabled &&
          settings.providers.anthropic.apiKey.trim().length > 0,
        settings.providers.google.enabled && settings.providers.google.apiKey.trim().length > 0,
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
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {availableModelOptions.length} models ready
              </div>
              <div className="rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {enabledProviderCount} providers live
              </div>
            </div>
          </div>

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
                    className="rounded-full border border-border/60 bg-background/85 px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    {option.label.replace(`${getProviderLabel(option.provider)} · `, "")}
                  </span>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <EditableProviderCard
              provider="openai"
              enabled={settings.providers.openai.enabled}
              apiKey={settings.providers.openai.apiKey}
              models={settings.providers.openai.models}
              onApiKeyChange={(value) => setProviderApiKey("openai", value)}
              onEnabledChange={(value) => setProviderEnabled("openai", value)}
              onModelsChange={(value) => setProviderModels("openai", value)}
            />
            <EditableProviderCard
              provider="anthropic"
              enabled={settings.providers.anthropic.enabled}
              apiKey={settings.providers.anthropic.apiKey}
              models={settings.providers.anthropic.models}
              onApiKeyChange={(value) => setProviderApiKey("anthropic", value)}
              onEnabledChange={(value) => setProviderEnabled("anthropic", value)}
              onModelsChange={(value) => setProviderModels("anthropic", value)}
            />
            <EditableProviderCard
              provider="google"
              enabled={settings.providers.google.enabled}
              apiKey={settings.providers.google.apiKey}
              models={settings.providers.google.models}
              onApiKeyChange={(value) => setProviderApiKey("google", value)}
              onEnabledChange={(value) => setProviderEnabled("google", value)}
              onModelsChange={(value) => setProviderModels("google", value)}
            />
          </div>
        </div>
      </WorkspaceShell>
    </div>
  );
}
