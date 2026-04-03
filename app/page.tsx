import { auth, authUiConfig } from "@/auth";
import { AuthScreen } from "@/components/auth/auth-screen";
import { Assistant } from "./assistant";

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) {
    return <AuthScreen {...authUiConfig} />;
  }
  return <Assistant />;
}
