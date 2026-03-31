import type { ThreadRepoItem } from "@/components/assistant-ui/use-thread-repo-items";
import type { SessionArtifact, SessionContextLink } from "@/lib/session-artifacts";
import type { EdgeConnectorInfo, LinkConnectorPref } from "./graph-types";
import { ROOT_NODE_ID } from "./graph-types";

type BuildThreadGraphExportTextArgs = {
  bridgeNodeIds: Set<string>;
  connectorDefaults: Map<string, LinkConnectorPref>;
  edgeConnectorMap: Map<string, EdgeConnectorInfo>;
  getEdgeKey: (parentId: string | null, childId: string) => string;
  getParentId: (childId?: string | null, fallback?: string | null) => string | null;
  itemOrderMap: Map<string, number>;
  linkConnectors: Map<string, LinkConnectorPref>;
  artifacts?: SessionArtifact[];
  contextLinks?: SessionContextLink[];
  repoItems: ThreadRepoItem[];
};

type ExportRecord = {
  id: string;
  parentId: string | null;
  role: string;
  branchId: unknown;
  order: number;
  isBridge: boolean;
};

export const buildThreadGraphExportText = ({
  bridgeNodeIds,
  connectorDefaults,
  edgeConnectorMap,
  getEdgeKey,
  getParentId,
  itemOrderMap,
  linkConnectors,
  artifacts = [],
  contextLinks = [],
  repoItems,
}: BuildThreadGraphExportTextArgs) => {
  const idToParent = new Map<string, string | null>();
  const parentToChildren = new Map<string | null, string[]>();
  const idToRecord = new Map<string, ExportRecord>();
  const visibleIds = new Set<string>();

  const registerItem = (item: ThreadRepoItem, idx: number) => {
    const id = item.message?.id;
    if (!id) return;
    const rawParent = item.parentId ?? null;
    const fallbackParent = rawParent === ROOT_NODE_ID ? null : rawParent;
    const effectiveParent = getParentId(id, fallbackParent);
    idToParent.set(id, effectiveParent);
    const children = parentToChildren.get(effectiveParent) ?? [];
    children.push(id);
    parentToChildren.set(effectiveParent, children);
    const branchId =
      item.message && typeof item.message === "object" && "branchId" in item.message
        ? (item.message as { branchId?: unknown }).branchId ?? null
        : null;
    const role = String(item.message?.role ?? "");
    const orderIndex = itemOrderMap.get(id) ?? idx;
    const isBridge = bridgeNodeIds.has(id);
    idToRecord.set(id, {
      id,
      parentId: effectiveParent,
      role,
      branchId,
      order: orderIndex,
      isBridge,
    });
    visibleIds.add(id);
  };

  repoItems.forEach((item, idx) => registerItem(item, idx));

  const combinedConnectors = new Map<string, LinkConnectorPref>();
  connectorDefaults.forEach((value, key) => {
    combinedConnectors.set(key, { ...value });
  });
  linkConnectors.forEach((value, key) => {
    combinedConnectors.set(key, { ...value });
  });

  const connectorEntries = Array.from(combinedConnectors.entries()).flatMap(([edgeKey, pref]) => {
    const info = edgeConnectorMap.get(edgeKey);
    const [rawParent, rawChild] = edgeKey.split("->");
    const parentIdRaw = info?.parentId ?? (rawParent === "null" ? null : rawParent ?? null);
    const parentId = parentIdRaw === ROOT_NODE_ID ? null : parentIdRaw;
    if (parentId === null) {
      return [];
    }
    const childId = info?.childId ?? rawChild ?? "";
    if (!visibleIds.has(childId) || bridgeNodeIds.has(childId)) {
      return [];
    }
    return [
      {
        edgeKey,
        description: "parent-child",
        colorLine: "grey",
        parentId,
        childId,
        connector: pref,
        custom: linkConnectors.has(edgeKey),
      },
    ];
  });

  const siblingConnectors: Array<{
    edgeKey: string;
    parentId: string | null;
    childId: string;
    siblingId: string;
    description: string;
    colorLine: string;
    connector: null;
    custom: false;
  }> = [];

  parentToChildren.forEach((children, parentId) => {
    if (children.length <= 1) return;
    const sorted = [...children].sort((a, b) => {
      const aOrder = idToRecord.get(a)?.order ?? 0;
      const bOrder = idToRecord.get(b)?.order ?? 0;
      return aOrder - bOrder;
    });
    sorted.forEach((childId, index) => {
      const nextId = sorted[index + 1];
      if (!nextId) return;
      siblingConnectors.push({
        edgeKey: `siblings:${parentId ?? "null"}:${childId}<->${nextId}`,
        parentId,
        childId: nextId,
        siblingId: childId,
        description: "siblings",
        colorLine: "red-dashed",
        connector: null,
        custom: false,
      });
    });
  });

  const payload = Array.from(idToRecord.values()).map((record) => {
    const { id, parentId, role, branchId, isBridge, order } = record;
    const children = parentToChildren.get(id) ?? [];
    const siblings = (parentToChildren.get(parentId) || []).filter((siblingId) => siblingId !== id);
    const edgeKey = parentId ? getEdgeKey(parentId, id) : null;
    const connectorPref =
      edgeKey && visibleIds.has(id) && !bridgeNodeIds.has(id)
        ? combinedConnectors.get(edgeKey) ?? null
        : null;
    return {
      id,
      parentId,
      role,
      branchId,
      children,
      siblings,
      connectorPref,
      orderIndex: order,
      isBridge: isBridge || undefined,
    };
  });

  payload.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const output = payload.map((item) => {
    const { orderIndex, ...rest } = item;
    void orderIndex;
    return rest;
  });

  const artifactPayload = artifacts.map((artifact) => ({
    id: artifact.id,
    type: artifact.artifactType,
    title: artifact.title,
    byteSize: artifact.byteSize ?? null,
    fileName: artifact.fileName ?? null,
    language: artifact.language ?? null,
    mimeType: artifact.mimeType ?? null,
    contentLength: artifact.content.length,
    position: artifact.position ?? null,
  }));

  return JSON.stringify(
    {
      nodes: output,
      connectors: [...connectorEntries, ...siblingConnectors],
      artifacts: artifactPayload,
      contextLinks: contextLinks.map((link) => ({
        artifactId: link.artifactId,
        targetMessageId: link.targetMessageId,
      })),
    },
    null,
    2,
  );
};
