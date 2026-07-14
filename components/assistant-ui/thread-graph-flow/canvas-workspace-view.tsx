"use client";

import React from "react";
import { CanvasBlockLibrary } from "@/components/assistant-ui/thread-graph-flow/block-library";
import { CanvasArtifactInspector } from "@/components/assistant-ui/thread-graph-flow/canvas-artifact-inspector";
import { CanvasMessageInspector } from "@/components/assistant-ui/thread-graph-flow/canvas-message-inspector";
import { CanvasSidebar } from "@/components/assistant-ui/thread-graph-flow/canvas-sidebar";
import { CanvasStage } from "@/components/assistant-ui/thread-graph-flow/canvas-stage";

type CanvasWorkspaceViewProps = {
  artifactInspectorProps: React.ComponentProps<typeof CanvasArtifactInspector> | null;
  blockLibraryProps: React.ComponentProps<typeof CanvasBlockLibrary>;
  fileUploadInputRef: React.RefObject<HTMLInputElement | null>;
  imageUploadInputRef: React.RefObject<HTMLInputElement | null>;
  inspectorScrollRef: React.RefObject<HTMLDivElement | null>;
  messageInspectorProps: React.ComponentProps<typeof CanvasMessageInspector> | null;
  onFileUploadChange: React.ChangeEventHandler<HTMLInputElement>;
  onImageUploadChange: React.ChangeEventHandler<HTMLInputElement>;
  sidebarProps: Omit<React.ComponentProps<typeof CanvasSidebar>, "children">;
  stageProps: React.ComponentProps<typeof CanvasStage>;
};

export function CanvasWorkspaceView({
  artifactInspectorProps,
  blockLibraryProps,
  fileUploadInputRef,
  imageUploadInputRef,
  inspectorScrollRef,
  messageInspectorProps,
  onFileUploadChange,
  onImageUploadChange,
  sidebarProps,
  stageProps,
}: CanvasWorkspaceViewProps) {
  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.08),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.96))] dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_22%),linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.9))]">
      <input
        ref={imageUploadInputRef}
        type="file"
        accept="image/*"
        data-testid="artifact-image-upload-input"
        className="hidden"
        onChange={onImageUploadChange}
      />
      <input
        ref={fileUploadInputRef}
        type="file"
        className="hidden"
        onChange={onFileUploadChange}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <CanvasBlockLibrary {...blockLibraryProps} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
          <CanvasSidebar {...sidebarProps}>
            <div
              ref={inspectorScrollRef}
              className="max-h-[min(34rem,calc(100vh-11rem))] overflow-y-auto rounded-[26px] border border-border/60 bg-background/85 px-3 py-3 shadow-sm"
            >
              {artifactInspectorProps ? (
                <CanvasArtifactInspector {...artifactInspectorProps} />
              ) : messageInspectorProps ? (
                <CanvasMessageInspector {...messageInspectorProps} />
              ) : (
                <div className="space-y-2 rounded-[24px] border border-dashed border-border/70 bg-background/80 px-4 py-5 text-left">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Nothing selected
                  </p>
                  <p className="text-sm font-medium text-foreground/85">
                    Pick a message node to branch, or select an artifact to shape
                    reusable context.
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    The canvas is your structured input layer. Use it to build
                    artifacts the model can reason over without losing
                    human-readable form.
                  </p>
                </div>
              )}
            </div>
          </CanvasSidebar>
          <CanvasStage {...stageProps} />
        </div>
      </div>
    </section>
  );
}
