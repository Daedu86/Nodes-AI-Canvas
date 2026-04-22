import type { ThreadRuntime } from "@assistant-ui/react";

type InterruptibleThreadRuntime = Pick<ThreadRuntime, "cancelRun" | "getState"> &
  Partial<Pick<ThreadRuntime, "unstable_on">>;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

export async function ensureThreadIdle(
  threadRuntime: InterruptibleThreadRuntime,
  options?: { settleMs?: number; timeoutMs?: number },
) {
  const settleMs = options?.settleMs ?? 40;
  const timeoutMs = options?.timeoutMs ?? 1500;

  if (!threadRuntime.getState().isRunning) {
    return true;
  }

  try {
    threadRuntime.cancelRun();
  } catch {
    // Ignore cancel failures and fall through to the timeout check below.
  }

  if (!threadRuntime.getState().isRunning) {
    return true;
  }

  await new Promise<void>((resolve) => {
    let finished = false;
    const cleanup: {
      unsubscribe?: () => void;
      timeoutId?: ReturnType<typeof globalThis.setTimeout>;
    } = {};

    const finish = () => {
      if (finished) return;
      finished = true;
      if (cleanup.unsubscribe) {
        cleanup.unsubscribe();
      }
      if (cleanup.timeoutId !== undefined) {
        globalThis.clearTimeout(cleanup.timeoutId);
      }
      resolve();
    };

    cleanup.unsubscribe = threadRuntime.unstable_on?.("runEnd", finish);
    cleanup.timeoutId = globalThis.setTimeout(finish, timeoutMs);
  });

  if (settleMs > 0) {
    await sleep(settleMs);
  }

  if (!threadRuntime.getState().isRunning) {
    return true;
  }

  const deadline = Date.now() + 250;
  while (threadRuntime.getState().isRunning && Date.now() < deadline) {
    await sleep(25);
  }

  return !threadRuntime.getState().isRunning;
}
