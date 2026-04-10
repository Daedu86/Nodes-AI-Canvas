import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, authUiConfig } from "@/auth";
import { AuthScreen } from "@/components/auth/auth-screen";
import { Assistant } from "./assistant";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const canonicalAppUrl = authUiConfig.canonicalAppUrl;
  if (canonicalAppUrl) {
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const protocol =
      requestHeaders.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
    if (host) {
      const currentOrigin = `${protocol}://${host}`;
      const canonicalOrigin = new URL(canonicalAppUrl).origin;
      if (currentOrigin !== canonicalOrigin) {
        const target = new URL(canonicalAppUrl);
        const resolvedSearchParams = (await searchParams) ?? {};
        for (const [key, value] of Object.entries(resolvedSearchParams)) {
          if (Array.isArray(value)) {
            value.forEach((entry) => target.searchParams.append(key, entry));
          } else if (typeof value === "string") {
            target.searchParams.set(key, value);
          }
        }
        redirect(target.toString());
      }
    }
  }

  const session = await auth();
  if (!session?.user?.id) {
    return <AuthScreen {...authUiConfig} />;
  }
  return <Assistant />;
}
