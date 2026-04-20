import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { StandaloneAdminUsersWorkspace } from "@/components/workspace/admin-users-workspace";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  return <StandaloneAdminUsersWorkspace />;
}
