"use client";

import React from "react";
import {
  createSerialTaskQueue,
  prependUniqueResource,
  replaceResourceById,
} from "@/lib/client/persisted-resource-client";

type ResourceWithId = { id: string };

const getResourceVersion = (resource: ResourceWithId) => {
  const version = (resource as ResourceWithId & { version?: unknown }).version;
  return typeof version === "number" && Number.isFinite(version) ? version : null;
};

const hasSameVersion = (current: ResourceWithId, next: ResourceWithId) => {
  const currentVersion = getResourceVersion(current);
  const nextVersion = getResourceVersion(next);
  return currentVersion !== null && nextVersion !== null && currentVersion === nextVersion;
};

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
      const currentActive = activeResourceRef.current;

      // Versioned persistence responses with the same version are acknowledgements
      // of an unchanged document. Re-applying them creates needless React updates
      // and can feed persistence bridges that subscribe to runtime/session changes.
      if (
        currentActive?.id === resource.id &&
        hasSameVersion(currentActive, resource)
      ) {
        return;
      }

      setResources((previous) => replaceResourceById(previous, resource));
      if (currentActive?.id === resource.id) {
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
  const queue = React.useMemo(() => createSerialTaskQueue(fallback), [fallback]);
  return React.useCallback((task: () => Promise<T>) => queue(task), [queue]);
}