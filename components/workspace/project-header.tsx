"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useProjects } from "@/components/context/projects";

const formatProjectTitle = (title: string | null) => title?.trim() || "Untitled Project";

export function ProjectHeader() {
  const { activeProject, clearActiveProject } = useProjects();
  const { activeSessionId } = usePersistedSessions();
  const accessRole = activeProject?.accessRole ?? "owner";

  const handleBackToSessions = () => {
    clearActiveProject();
    if (!activeSessionId || typeof window === "undefined") return;
    window.location.assign(`/?sessionId=${encodeURIComponent(activeSessionId)}`);
  };

  const handleOpenCollaboration = () => {
    if (!activeProject || typeof window === "undefined") return;
    window.location.assign(`/projects/${encodeURIComponent(activeProject.id)}/collaboration`);
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{formatProjectTitle(activeProject?.title ?? null)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-2">
        {accessRole !== "owner" ? (
          <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-700">
            {accessRole}
          </span>
        ) : null}
        <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-700">
          {activeProject?.sessionCount ?? 0} session{activeProject?.sessionCount === 1 ? "" : "s"}
        </span>
        {accessRole === "owner" ? (
          <Button type="button" variant="outline" size="sm" onClick={handleOpenCollaboration}>
            Collaborate
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={handleBackToSessions}>
          Back to sessions
        </Button>
      </div>
    </header>
  );
}
