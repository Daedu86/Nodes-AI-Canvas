"use client";

import React from "react";
import {
  prependUniqueResource,
  replaceResourceById,
} from "@/lib/client/persisted-resource-client";

type ResourceWithId = { id: string };

export function usePersistedResourceState<
  TSummary extends ResourceWithId,
  TDocument extends TSummary,
>() {
  const [resources, setResourcesState] = React.useState<TSummary[]>([]);
  const [activeResource, setActiveResourceState] =
    React.useState<TDocument | null>(null);
  const resourcesRef = React.useRef<TSummary[]>([]);
  const activeResourceRef = React.useRef<TDocument | null>(null);

  const setResources = React.useCallback(
    (update: React.SetStateAction<TSummary[]>) => {
      setResourcesState((previous) => {
        const next =
          typeof update === "function"
            ? (update as (value: TSummary[]) => TSummary[])(previous)
            : update;
        resourcesRef.current = next;
        return next;
      });
    },
    [],
  );

  const setActiveResource = React.useCallback((resource: TDocument | null) => {
    activeResourceRef.current = resource;
    setActiveResourceState(resource);
  }, []);

  const updateKnownResource = React.useCallback(
    (resource: TDocument) => {
      setResources((previous) => replaceResourceById(previous, resource));
      if (activeResourceRef.current?.id === resource.id) {
        setActiveResource(resource);
      }
    },
    [setActiveResource, setResources],
  );

  const prependResource = React.useCallback(
    (resource: TDocument) => {
      setResources((previous) => prependUniqueResource(previous, resource));
    },
    [setResources],
  );

  const getKnownResource = React.useCallback((resourceId: string) => {
    if (activeResourceRef.current?.id === resourceId) {
      return activeResourceRef.current;
    }
    return resourcesRef.current.find((item) => item.id === resourceId) ?? null;
  }, []);

  return {
    activeResource,
    activeResourceRef,
    getKnownResource,
    prependResource,
    resources,
    resourcesRef,
    setActiveResource,
    setResources,
    updateKnownResource,
  };
}

export function useSerialTaskQueue<T>(fallback: T) {
  const queueRef = React.useRef<Promise<T>>(Promise.resolve(fallback));

  return React.useCallback(
    (task: () => Promise<T>) => {
      const next = queueRef.current.then(task, task);
      queueRef.current = next.catch(() => fallback);
      return next;
    },
    [fallback],
  );
}
