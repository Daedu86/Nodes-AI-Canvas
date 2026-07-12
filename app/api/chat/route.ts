"use strict";

import { handleChatPost } from "@/lib/server/chat/handler";
import { requireLocalApiUser } from "@/lib/server/request-guards";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const guarded = await requireLocalApiUser(req);
  if (guarded.response instanceof Response) return guarded.response;
  return handleChatPost(req, guarded.user);
}
