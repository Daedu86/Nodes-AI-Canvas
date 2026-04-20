import { reservePersistentChatUsage, __resetChatUsageStoreForTests } from "@/lib/chat-usage-store";
import { createEmptyChatUsageSnapshot, type ChatUsageSnapshot } from "@/lib/chat-usage";
import { getChatQuotaLimits, type ChatQuotaLimits, type UserPlan } from "@/lib/user-plan";

type ChatConcurrencyState = {
  active: number;
};

type ChatQuotaGrant = {
  headers: Headers;
  release: () => void;
};

type ChatQuotaRejection = {
  code: "chat_concurrency_limited" | "chat_quota_exceeded";
  headers: Headers;
  message: string;
  retryAfterSeconds: number;
  status: 429;
};

type ChatQuotaResult =
  | { ok: true; grant: ChatQuotaGrant }
  | { ok: false; rejection: ChatQuotaRejection };

const getChatGovernorStore = () => {
  const globalState = globalThis as typeof globalThis & {
    __nodesChatGovernorStore?: Map<string, ChatConcurrencyState>;
  };
  if (!globalState.__nodesChatGovernorStore) {
    globalState.__nodesChatGovernorStore = new Map();
  }
  return globalState.__nodesChatGovernorStore;
};

const buildHeaders = ({
  active,
  limits,
  snapshot,
}: {
  active: number;
  limits: ChatQuotaLimits;
  snapshot: ChatUsageSnapshot;
}) => {
  const headers = new Headers();
  headers.set("x-nodes-chat-limit-minute", String(limits.perMinute));
  headers.set(
    "x-nodes-chat-remaining-minute",
    String(Math.max(0, limits.perMinute - snapshot.minuteCount)),
  );
  headers.set("x-nodes-chat-limit-hour", String(limits.perHour));
  headers.set(
    "x-nodes-chat-remaining-hour",
    String(Math.max(0, limits.perHour - snapshot.hourCount)),
  );
  headers.set("x-nodes-chat-limit-day", String(limits.perDay));
  headers.set(
    "x-nodes-chat-remaining-day",
    String(Math.max(0, limits.perDay - snapshot.dayCount)),
  );
  headers.set("x-nodes-chat-limit-concurrent", String(limits.concurrent));
  headers.set("x-nodes-chat-active", String(active));
  headers.set("x-nodes-user-plan", limits.plan);
  return headers;
};

export async function reserveChatQuota(
  userId: string,
  userPlan: UserPlan,
  now = Date.now(),
): Promise<ChatQuotaResult> {
  const limits = getChatQuotaLimits(userPlan);
  const store = getChatGovernorStore();
  const state = store.get(userId) ?? {
    active: 0,
  };

  if (state.active >= limits.concurrent) {
    const headers = buildHeaders({
      active: state.active,
      limits,
      snapshot: createEmptyChatUsageSnapshot(now),
    });
    headers.set("Retry-After", "5");
    return {
      ok: false,
      rejection: {
        code: "chat_concurrency_limited",
        headers,
        message: "The assistant is still responding. Wait for it to finish or cancel the current run.",
        retryAfterSeconds: 5,
        status: 429,
      },
    };
  }

  const usage = await reservePersistentChatUsage(
    userId,
    {
      perDay: limits.perDay,
      perHour: limits.perHour,
      perMinute: limits.perMinute,
    },
    now,
  );

  if (!usage.allowed) {
    const headers = buildHeaders({
      active: state.active,
      limits,
      snapshot: usage.snapshot,
    });
    headers.set("Retry-After", String(usage.retryAfterSeconds));
    return {
      ok: false,
      rejection: {
        code: "chat_quota_exceeded",
        headers,
        message: "You have hit the current assistant usage limit. Wait a bit before sending another request.",
        retryAfterSeconds: usage.retryAfterSeconds,
        status: 429,
      },
    };
  }

  state.active += 1;
  store.set(userId, state);

  let released = false;
  return {
    ok: true,
    grant: {
      headers: buildHeaders({
        active: state.active,
        limits,
        snapshot: usage.snapshot,
      }),
      release: () => {
        if (released) return;
        released = true;
        const current = store.get(userId);
        if (!current) return;
        current.active = Math.max(0, current.active - 1);
        if (current.active === 0) {
          store.delete(userId);
          return;
        }
        store.set(userId, current);
      },
    },
  };
}

export async function __resetChatGovernorForTests() {
  getChatGovernorStore().clear();
  await __resetChatUsageStoreForTests();
}
