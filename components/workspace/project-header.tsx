"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useProjects } from "@/components/context/projects";

const formatProjectTitle = (title: string | null) => title?.trim() || "Untitled Project";

export function ProjectHeader() {
  const { activeProject, clearActiveProject } = useProjects();

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <span className="text-muted-foreground">Projects</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>{formatProjectTitle(activeProject?.title ?? null)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-2">
        <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-700">
          {activeProject?.sessionCount ?? 0} session{activeProject?.sessionCount === 1 ? "" : "s"}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={clearActiveProject}>
          Back to sessions
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
