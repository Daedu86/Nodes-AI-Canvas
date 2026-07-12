import { authUiConfig } from "@/auth";
import { parseCanonicalAppUrl } from "@/lib/auth/canonical-app-url";

export function getPublicAppOrigin(request: Request) {
  const canonical = parseCanonicalAppUrl(authUiConfig.canonicalAppUrl);
  if (canonical) return canonical.origin;
  const requestUrl = new URL(request.url);
  if (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") {
    throw new Error("Unable to resolve the public application origin.");
  }
  return requestUrl.origin;
}
