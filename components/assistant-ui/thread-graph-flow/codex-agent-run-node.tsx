"use client";

import { memo, useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Check, CheckCircle2, ChevronDown, ChevronUp, Copy, GitBranchPlus, Play, RotateCcw, ShieldQuestion, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CodexAgentRole } from "@/lib/agents/codex/types";
import { CODEX_MODEL_OPTIONS, CODEX_TOOL_OPTIONS, readCodexAgentDefaults, type CodexAgentDefaults, type CodexAgentTool } from "@/lib/agents/codex/defaults";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

const RUNNING_STATUSES = new Set(["queued", "running", "waiting_for_approval"]);
const roleLabels: Record<CodexAgentRole, string> = { coder: "Coder", reviewer: "Reviewer", researcher: "Researcher", tester: "Tester", custom: "Custom" };
const statusLabels: Record<string, string> = { queued: "Queued", running: "Running", waiting_for_approval: "Needs approval", completed: "Completed", failed: "Failed", cancelled: "Cancelled" };

export const CodexAgentRunNode = memo(({ data, selected }: NodeProps<ThreadGraphFlowNode>) => {
  const status = data.agentStatus ?? "queued";
  const role = data.agentRole ?? "coder";
  const prompt = data.agentPrompt ?? "";
  const output = data.agentOutput ?? "";
  const running = RUNNING_STATUSES.has(status);
  const started = Boolean(data.agentRunId);
  const completed = status === "completed";
  const canStart = !started && prompt.trim().length > 0;
  const pendingApproval = data.agentPendingApprovalId;
  const [responseExpanded, setResponseExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState<CodexAgentDefaults>(() => readCodexAgentDefaults());

  useEffect(() => {
    const sync = () => { if (!started) setSettings(readCodexAgentDefaults()); };
    window.addEventListener("codex-agent-defaults-changed", sync);
    return () => window.removeEventListener("codex-agent-defaults-changed", sync);
  }, [started]);

  const copyOutput = async () => {
    if (!output) return;
    try { await navigator.clipboard.writeText(output); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { setCopied(false); }
  };
  const toggleTool = (tool: CodexAgentTool) => {
    if (started) return;
    setSettings((current) => ({ ...current, tools: current.tools.includes(tool) ? current.tools.filter((item) => item !== tool) : [...current.tools, tool] }));
  };

  return <div className={["group relative w-[450px] rounded-2xl border bg-slate-950/95 p-px shadow-[0_24px_60px_-34px_rgba(59,130,246,0.5)] transition-all", selected ? "ring-2 ring-sky-300/80" : "ring-1 ring-white/10"].join(" ")}>
    <div className="relative overflow-hidden rounded-[15px] border border-white/8 bg-slate-950/95 px-4 py-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_40%),linear-gradient(180deg,rgba(9,20,38,0.98),rgba(6,12,24,0.98))]" />
      <div className="pointer-events-none absolute left-0 top-0 h-full w-1 bg-sky-500" />
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-slate-950 !bg-sky-300/90" style={{ left: -7 }} />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-slate-950 !bg-sky-300/90" style={{ right: -7 }} />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/25 bg-sky-400/10 text-sky-200"><Bot className="h-5 w-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-sky-300/35 bg-sky-400/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100">Codex Agent</span><span className="rounded-full border border-indigo-300/30 bg-indigo-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-100">LLM · {settings.model}</span><span className={["rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", pendingApproval ? "border-amber-300/40 bg-amber-400/15 text-amber-100" : completed ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/[0.04] text-slate-200/90"].join(" ")}>{statusLabels[status] ?? status.replaceAll("_", " ")}</span>{data.agentParentRunId ? <span className="rounded-full border border-violet-300/30 bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">Subagent</span> : null}</div><div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-300/85"><span className="font-medium text-slate-100">{roleLabels[role]}</span>{started ? <span>· {data.agentEventCount ?? 0} events</span> : <span>· Ready for a general task</span>}</div></div></div>
        <button type="button" className="nodrag nopan inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-300/30 bg-rose-400/10 text-rose-100 disabled:opacity-40" disabled={running && started} onClick={(event) => { event.stopPropagation(); data.onAgentRemove?.(); }}><Trash2 className="h-4 w-4" /></button>
      </div>

      <div className="relative mt-4 space-y-3">
        {pendingApproval ? <div className="nodrag nopan rounded-xl border-2 border-amber-300/45 bg-amber-400/12 p-3 shadow-[0_0_30px_-18px_rgba(251,191,36,0.9)]"><div className="flex items-start gap-2"><ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" /><div><p className="text-sm font-semibold text-amber-100">Action approval required</p><p className="mt-1 text-[11px] leading-4 text-amber-100/75">Codex paused before executing a protected action. Choose an option below to continue.</p></div></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" className="nodrag nopan bg-emerald-400 text-slate-950 hover:bg-emerald-300" onClick={(event) => { event.stopPropagation(); data.onAgentApproval?.("accept"); }}><Check className="mr-1.5 h-4 w-4" />Approve once</Button><Button size="sm" variant="outline" className="nodrag nopan border-sky-300/35 bg-sky-400/10 text-sky-100" onClick={(event) => { event.stopPropagation(); data.onAgentApproval?.("acceptForSession"); }}><CheckCircle2 className="mr-1.5 h-4 w-4" />Approve for session</Button><Button size="sm" variant="outline" className="nodrag nopan border-rose-300/35 bg-rose-400/10 text-rose-100" onClick={(event) => { event.stopPropagation(); data.onAgentApproval?.("decline"); }}><X className="mr-1.5 h-4 w-4" />Decline</Button></div></div> : null}

        <div className="grid gap-3 md:grid-cols-2"><label className="block text-xs text-slate-200"><span className="mb-1.5 block font-medium">Role</span><select value={role} disabled={started} onChange={(event) => data.onAgentRoleChange?.(event.target.value as CodexAgentRole)} className="nodrag nowheel h-10 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 text-xs text-slate-100 disabled:opacity-60">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block text-xs text-slate-200"><span className="mb-1.5 block font-medium">Model</span><select value={settings.model} disabled={started} onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))} className="nodrag nowheel h-10 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 text-xs text-slate-100 disabled:opacity-60">{CODEX_MODEL_OPTIONS.map((model) => <option key={model} value={model}>{model}</option>)}</select></label></div>

        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-slate-200">Tools</span>{!started ? <button type="button" className="nodrag inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-white" onClick={() => setSettings(readCodexAgentDefaults())}><RotateCcw className="h-3 w-3" />Reset to defaults</button> : null}</div><div className="mt-2 flex flex-wrap gap-2">{CODEX_TOOL_OPTIONS.map((tool) => <button key={tool} type="button" disabled={started} onClick={() => toggleTool(tool)} className={`nodrag rounded-lg border px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-60 ${settings.tools.includes(tool) ? "border-sky-300/35 bg-sky-400/12 text-sky-100" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>{settings.tools.includes(tool) ? "✓ " : ""}{tool}</button>)}</div><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-[11px] text-slate-300"><span className="mb-1 block">Workspace</span><select value={settings.workspace} disabled={started} onChange={(event) => setSettings((current) => ({ ...current, workspace: event.target.value as CodexAgentDefaults["workspace"] }))} className="nodrag nowheel h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-2 text-xs"><option value="temporary">Temporary</option><option value="project">Current project</option></select></label><label className="text-[11px] text-slate-300"><span className="mb-1 block">Approval</span><select value={settings.approvalMode} disabled={started} onChange={(event) => setSettings((current) => ({ ...current, approvalMode: event.target.value as CodexAgentDefaults["approvalMode"] }))} className="nodrag nowheel h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-2 text-xs"><option value="ask">Ask first</option><option value="auto">Auto approve</option></select></label></div></div>

        <label className="block text-xs text-slate-200"><span className="mb-1.5 block font-medium">Task</span><textarea aria-label="Codex agent task" rows={5} value={prompt} placeholder="Example: research a topic, analyze a document, prepare a plan, or complete another multi-step task." disabled={started} onChange={(event) => data.onAgentPromptChange?.(event.target.value)} className="nodrag nowheel min-h-[124px] w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm leading-5 text-slate-50 outline-none placeholder:text-slate-400/80 focus:border-sky-300/55 disabled:opacity-70" /></label>

        {output ? <section className="overflow-hidden rounded-xl border border-sky-300/20 bg-sky-950/30"><div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5"><div className="flex min-w-0 items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" /><div><p className="text-xs font-semibold text-slate-100">Agent response</p><p className="text-[10px] text-slate-400">{completed ? "Final result" : "Live output"}</p></div></div><div className="flex gap-1"><button type="button" className="nodrag nopan inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] text-slate-300 hover:bg-white/10" onClick={(event) => { event.stopPropagation(); void copyOutput(); }}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</button><button type="button" className="nodrag nopan inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] text-slate-300 hover:bg-white/10" onClick={(event) => { event.stopPropagation(); setResponseExpanded((value) => !value); }}>{responseExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{responseExpanded ? "Collapse" : "Expand"}</button></div></div><div className={["nodrag nowheel overflow-auto whitespace-pre-wrap break-words px-3 py-3 text-sm leading-6 text-slate-100", responseExpanded ? "max-h-[440px]" : "max-h-52"].join(" ")}>{output}</div></section> : null}
        {data.agentError ? <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">{data.agentError}</div> : null}
      </div>

      <div className="relative mt-4 flex flex-wrap justify-end gap-2 border-t border-white/8 pt-3">{started && data.onAgentSpawnChild ? <Button variant="outline" className="nodrag border-violet-300/30 bg-violet-400/10 text-violet-100" onClick={data.onAgentSpawnChild}><GitBranchPlus className="mr-1.5 h-4 w-4" />Subagent</Button> : null}{running && started ? <Button variant="outline" className="nodrag border-amber-300/35 bg-amber-400/10 text-amber-100" onClick={data.onAgentCancel}><Square className="mr-1.5 h-4 w-4" />Cancel</Button> : null}{!started ? <Button className="nodrag bg-sky-400 text-slate-950 hover:bg-sky-300" disabled={!canStart} onClick={data.onAgentStart}><Play className="mr-1.5 h-4 w-4" />Run agent</Button> : null}</div>
    </div>
  </div>;
});

CodexAgentRunNode.displayName = "CodexAgentRunNode";