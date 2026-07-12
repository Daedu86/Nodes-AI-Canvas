import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProjectCollaborationManager } from "@/components/project-collaboration-manager";

export const metadata: Metadata = {
  title: "Project collaboration",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ projectId: string }> };

export default async function ProjectCollaborationPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { projectId } = await params;
  return <ProjectCollaborationManager projectId={projectId} />;
}
