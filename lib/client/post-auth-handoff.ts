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

export const buildPostAuthCallbackUrl = (pathname = "/") => {
  if (canUseWindow()) {
    const url = new URL(pathname, window.location.origin);
    url.searchParams.set(POST_AUTH_HANDOFF_PARAM, POST_AUTH_HANDOFF_VALUE);
    return url.toString();
  }
  const url = new URL(pathname, "http://localhost");
  url.searchParams.set(POST_AUTH_HANDOFF_PARAM, POST_AUTH_HANDOFF_VALUE);
  return `${url.pathname}${url.search}`;
};

export const clearPostAuthHandoff = () => {
  if (!canUseWindow()) return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(POST_AUTH_HANDOFF_PARAM)) return;
  url.searchParams.delete(POST_AUTH_HANDOFF_PARAM);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next);
};
