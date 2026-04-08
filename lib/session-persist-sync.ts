const listeners = new Set<() => void>();

let pending = false;
let forcePersistHandlerCount = 0;

export const FORCE_PERSIST_SESSION_EVENT = "assistant-ui:force-persist-session";

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
