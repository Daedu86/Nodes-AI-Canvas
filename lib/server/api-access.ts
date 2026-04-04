const JSON_HEADERS = {
  "Content-Type": "application/json",
} as const;

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const getEnvFlag = (value: string | undefined) => value === "1";

const isLoopbackHostname = (value: string | null | undefined) => {
  if (!value) return false;
  return LOOPBACK_HOSTNAMES.has(value.trim().toLowerCase());
};

const normalizeAddress = (value: string) => {
  const trimmed = value.trim().replace(/^\[|\]$/g, "");
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice("::ffff:".length).toLowerCase();
  }
  return trimmed.toLowerCase();
};

const isLoopbackAddress = (value: string | null | undefined) => {
  if (!value) return false;
  const normalized = normalizeAddress(value);
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "localhost"
  );
};

const parseHostname = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    try {
      return new URL(`http://${value}`).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
};

const jsonError = (error: string, status = 403) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: JSON_HEADERS,
  });

export function isRemoteApiAllowed() {
  return getEnvFlag(process.env.ALLOW_REMOTE_API);
}

export function enforceLocalApiAccess(req: Request) {
  const requestUrl = new URL(req.url);
  if (!isRemoteApiAllowed()) {
    if (!isLoopbackHostname(requestUrl.hostname)) {
      return jsonError("Remote API access is disabled for this local-first workspace.");
    }

    const hostHeader = parseHostname(req.headers.get("host"));
    if (hostHeader && !isLoopbackHostname(hostHeader)) {
      return jsonError("Remote host access is disabled for this local-first workspace.");
    }

    const forwardedFor = req.headers.get("x-forwarded-for");
    if (forwardedFor) {
      const firstHop = forwardedFor.split(",")[0]?.trim();
      if (!isLoopbackAddress(firstHop)) {
        return jsonError("Forwarded remote requests are not allowed.");
      }
    }

    const realIp = req.headers.get("x-real-ip");
    if (realIp && !isLoopbackAddress(realIp)) {
      return jsonError("Remote client addresses are not allowed.");
    }
  }

  const method = req.method.toUpperCase();
  if (!MUTATING_METHODS.has(method)) {
    return null;
  }

  const originHeader = req.headers.get("origin");
  if (originHeader) {
    const originHost = parseHostname(originHeader);
    if (!originHost || originHost !== requestUrl.hostname.toLowerCase()) {
      return jsonError("Cross-origin requests to the API are blocked.");
    }
  }

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return jsonError("Cross-site requests to the API are blocked.");
  }

  return null;
}
