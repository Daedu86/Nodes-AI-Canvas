import { NextResponse, type NextRequest } from "next/server";
import {
  createBrowserRequestNonce,
  createContentSecurityPolicy,
} from "@/lib/server/browser-security";

export function proxy(request: NextRequest) {
  const nonce = createBrowserRequestNonce();
  const contentSecurityPolicy = createContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)",
  ],
};
