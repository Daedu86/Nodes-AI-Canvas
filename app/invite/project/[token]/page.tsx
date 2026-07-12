import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectInvitationAcceptance } from "@/components/project-invitation-acceptance";
import { isValidProjectInvitationToken } from "@/lib/server/project-invitation-token";

export const metadata: Metadata = {
  title: "Project invitation",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

export default async function ProjectInvitationPage({ params }: PageProps) {
  const { token } = await params;
  if (!isValidProjectInvitationToken(token)) notFound();
  return <ProjectInvitationAcceptance token={token} />;
}
