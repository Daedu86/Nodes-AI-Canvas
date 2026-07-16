const listeners = new Set<() => void>();
const persistenceSuspensionTokens = new Set<symbol>();

let pending = false;
let forcePersistHandlerCount = 0;

export const FORCE_PERSIST_SESSION_EVENT = "assistant-ui:force-persist-session";
export const SESSION_RUNTIME_CHANGED_EVENT = "assistant-ui:session-runtime-changed";

export const notifySessionRuntimeChanged = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_RUNTIME_CHANGED_EVENT));
};

export type SessionPersistSuspensionToken = symbol;

/**
 * Prevents provisional runtime changes from reaching the persisted session.
 * The opaque token makes releasing a stale/previous transaction a no-op.
 */
export const suspendSessionPersist = (): SessionPersistSuspensionToken => {
  const token = Symbol("session-persist-suspension");
  persistenceSuspensionTokens.add(token);
  markSessionPersistPending();
  return token;
};

export const isSessionPersistSuspended = () => persistenceSuspensionTokens.size > 0;

/**
 * Releases one suspension. The final release schedules exactly one persistence
 * pass from the runtime's now-committed (or restored) state.
 */
export const resumeSessionPersist = (token: SessionPersistSuspensionToken) => {
  if (!persistenceSuspensionTokens.delete(token)) return false;
  if (persistenceSuspensionTokens.size === 0) {
    notifySessionRuntimeChanged();
  }
  return true;
};

const notify = () => {
  const current = [...listeners];
  listeners.clear();
  current.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener failures
    }
  });
};

export const markSessionPersistPending = () => {
  pending = true;
};

export const markSessionPersistSettled = () => {
  pending = false;
  notify();
};

export const isSessionPersistPending = () => pending;

export const registerSessionPersistHandler = () => {
  forcePersistHandlerCount += 1;
  return () => {
    forcePersistHandlerCount = Math.max(0, forcePersistHandlerCount - 1);
  };
};

export const waitForSessionPersist = (timeoutMs = 1_500) => {
  if (!pending) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      listeners.delete(finish);
      resolve();
    };
    listeners.add(finish);
    window.setTimeout(finish, timeoutMs);
  });
};

export const forceSessionPersist = async (timeoutMs = 1_500) => {
  if (typeof window === "undefined") {
    return;
  }

  if (forcePersistHandlerCount > 0) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const timeoutId = window.setTimeout(finish, timeoutMs);
      window.dispatchEvent(
        new CustomEvent(FORCE_PERSIST_SESSION_EVENT, {
          detail: {
            resolve: () => {
              window.clearTimeout(timeoutId);
              finish();
            },
          },
        }),
      );
    });
  }

  await waitForSessionPersist(timeoutMs);
};
