"use client";

const POST_AUTH_HANDOFF_PARAM = "handoff";
const POST_AUTH_HANDOFF_VALUE = "chat";

const canUseWindow = () => typeof window !== "undefined";

export const getPostAuthHandoff = () => {
  if (!canUseWindow()) return null;
  const params = new URLSearchParams(window.location.search);
  return params.get(POST_AUTH_HANDOFF_PARAM);
};

export const hasPostAuthChatHandoff = () =>
  getPostAuthHandoff() === POST_AUTH_HANDOFF_VALUE;

export const buildPostAuthCallbackUrl = (
  pathname = "/",
  originOverride?: string | null,
) => {
  const baseOrigin =
    originOverride?.trim() ||
    (canUseWindow() ? window.location.origin : "http://localhost");
  const url = new URL(pathname, baseOrigin);
  url.searchParams.set(POST_AUTH_HANDOFF_PARAM, POST_AUTH_HANDOFF_VALUE);
  return url.toString();
};

export const clearPostAuthHandoff = () => {
  if (!canUseWindow()) return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(POST_AUTH_HANDOFF_PARAM)) return;
  url.searchParams.delete(POST_AUTH_HANDOFF_PARAM);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next);
};
