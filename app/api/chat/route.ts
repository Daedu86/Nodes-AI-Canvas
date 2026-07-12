"use strict";

import { handleChatPost } from "@/lib/server/chat/handler";
import { requireLocalApiUser } from "@/lib/server/request-guards";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  return handleChatPost(req, guarded.user);
}
