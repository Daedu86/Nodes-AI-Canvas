"use client";

import { ProjectWorkspaceView } from "@/components/workspace/project-workspace-view";
import { useProjectWorkspaceController } from "@/components/workspace/use-project-workspace-controller";

export function ProjectWorkspace() {
  const controller = useProjectWorkspaceController();
  return controller ? <ProjectWorkspaceView {...controller} /> : null;
}
