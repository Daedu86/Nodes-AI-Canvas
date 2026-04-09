const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const getPositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

type ChatQuotaState = {
  active: number;
  hourCount: number;
  hourWindowStart: number;
  minuteCount: number;
  minuteWindowStart: number;
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
    __nodesChatGovernorStore?: Map<string, ChatQuotaState>;
  };
  if (!globalState.__nodesChatGovernorStore) {
    globalState.__nodesChatGovernorStore = new Map();
  }
  return globalState.__nodesChatGovernorStore;
};

const buildHeaders = (state: ChatQuotaState) => {
  const maxPerMinute = getPositiveInt(process.env.NODES_CHAT_LIMIT_PER_MINUTE, 24);
  const maxPerHour = getPositiveInt(process.env.NODES_CHAT_LIMIT_PER_HOUR, 120);
  const maxConcurrent = getPositiveInt(process.env.NODES_CHAT_LIMIT_CONCURRENT, 2);
  const headers = new Headers();
  headers.set("x-nodes-chat-limit-minute", String(maxPerMinute));
  headers.set("x-nodes-chat-remaining-minute", String(Math.max(0, maxPerMinute - state.minuteCount)));
  headers.set("x-nodes-chat-limit-hour", String(maxPerHour));
  headers.set("x-nodes-chat-remaining-hour", String(Math.max(0, maxPerHour - state.hourCount)));
  headers.set("x-nodes-chat-limit-concurrent", String(maxConcurrent));
  headers.set("x-nodes-chat-active", String(state.active));
  return headers;
};

export function reserveChatQuota(userId: string, now = Date.now()): ChatQuotaResult {
  const maxPerMinute = getPositiveInt(process.env.NODES_CHAT_LIMIT_PER_MINUTE, 24);
  const maxPerHour = getPositiveInt(process.env.NODES_CHAT_LIMIT_PER_HOUR, 120);
  const maxConcurrent = getPositiveInt(process.env.NODES_CHAT_LIMIT_CONCURRENT, 2);
  const store = getChatGovernorStore();
  const state = store.get(userId) ?? {
    active: 0,
    hourCount: 0,
    hourWindowStart: now,
    minuteCount: 0,
    minuteWindowStart: now,
  };

  if (now - state.minuteWindowStart >= MINUTE) {
    state.minuteWindowStart = now;
    state.minuteCount = 0;
  }
  if (now - state.hourWindowStart >= HOUR) {
    state.hourWindowStart = now;
    state.hourCount = 0;
  }

  if (state.active >= maxConcurrent) {
    const headers = buildHeaders(state);
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

  if (state.minuteCount >= maxPerMinute || state.hourCount >= maxPerHour) {
    const retryAfterMs =
      state.minuteCount >= maxPerMinute
        ? Math.max(SECOND, state.minuteWindowStart + MINUTE - now)
        : Math.max(SECOND, state.hourWindowStart + HOUR - now);
    const headers = buildHeaders(state);
    headers.set("Retry-After", String(Math.ceil(retryAfterMs / SECOND)));
    return {
      ok: false,
      rejection: {
        code: "chat_quota_exceeded",
        headers,
        message: "You have hit the current assistant usage limit. Wait a bit before sending another request.",
        retryAfterSeconds: Math.ceil(retryAfterMs / SECOND),
        status: 429,
      },
    };
  }

  state.active += 1;
  state.minuteCount += 1;
  state.hourCount += 1;
  store.set(userId, state);

  let released = false;
  return {
    ok: true,
    grant: {
      headers: buildHeaders(state),
      release: () => {
        if (released) return;
        released = true;
        const current = store.get(userId);
        if (!current) return;
        current.active = Math.max(0, current.active - 1);
        if (
          current.active === 0 &&
          current.minuteCount === 0 &&
          current.hourCount === 0
        ) {
          store.delete(userId);
          return;
        }
        store.set(userId, current);
      },
    },
  };
}

export function __resetChatGovernorForTests() {
  getChatGovernorStore().clear();
}
