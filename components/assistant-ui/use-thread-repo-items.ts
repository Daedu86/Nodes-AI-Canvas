import { useEffect, useState } from "react";
import type { AssistantRuntime } from "@assistant-ui/react";
import type { ThreadRuntimeEventType } from "@assistant-ui/react/runtimes/core/ThreadRuntimeCore";
import type { ExportedMessageRepository } from "@assistant-ui/react/runtimes/utils/MessageRepository";

export type ThreadRepoItem = ExportedMessageRepository["messages"][number];

type Options = {
  enabled?: boolean;
};

const THREAD_EVENTS: ThreadRuntimeEventType[] = [
  "initialize",
  "run-start",
  "run-end",
  "model-context-update",
];

export function useThreadRepoItems(
  runtime: AssistantRuntime | null | undefined,
  options: Options = {},
): ThreadRepoItem[] {
  const { enabled = true } = options;
  const [items, setItems] = useState<ThreadRepoItem[]>([]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return;
    }

    const thread = runtime?.threads?.main;
    if (!thread) {
      setItems([]);
      return;
    }

    let isMounted = true;
    const readExport = () => {
      if (!isMounted) return;
      try {
        const exportValue = thread.export();
        setItems(Array.isArray(exportValue?.messages) ? exportValue.messages : []);
      } catch {
        if (isMounted) setItems([]);
      }
    };

    readExport();
    const unsubscribes: Array<(() => void) | undefined> = [];
    unsubscribes.push(thread.subscribe(readExport));
    THREAD_EVENTS.forEach((event) => {
      unsubscribes.push(thread.unstable_on(event, readExport));
    });

    return () => {
      isMounted = false;
      unsubscribes.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch {
          /* swallow */
        }
      });
    };
  }, [enabled, runtime]);

  return items;
}

