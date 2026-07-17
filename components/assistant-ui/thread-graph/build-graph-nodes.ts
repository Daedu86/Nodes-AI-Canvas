import type { ThreadRepoItem } from "@/components/assistant-ui/use-thread-repo-items";
import { ASSISTANT_EDIT_METADATA_KEY } from "@/lib/assistant-edit-branching";
import { getModelEntry } from "@/lib/message-model-registry";
import { getDetachedFromMessageId } from "@/lib/thread-node-deletion";
import { extractText } from "./graph-geometry";
import type { Node } from "./graph-types";
import { ROOT_NODE_ID, ROOT_NODE_LABEL } from "./graph-types";

type BuildThreadGraphNodesArgs = {
  repoItems: ThreadRepoItem[];
  bridgeNodeIds: Set<string>;
  getParentId: (childId?: string | null, fallback?: string | null) => string | null;
};

export const buildThreadGraphNodes = ({
  repoItems,
  bridgeNodeIds,
  getParentId,
}: BuildThreadGraphNodesArgs): Node[] => {
  const map = new Map<string, ThreadRepoItem>();
  repoItems.forEach((item) => map.set(item.message?.id, item));

  const depthCache = new Map<string, number>();
  const getDepth = (message: ThreadRepoItem["message"]): number => {
    const id = message?.id;
    if (!id) return 0;
    if (depthCache.has(id)) return depthCache.get(id)!;
    let depth = 0;
    let current = message;
    const guard = new Set<string>();
    while (true) {
      const parentId = map.get(current?.id)?.parentId ?? undefined;
      if (!parentId || !map.has(parentId) || guard.has(parentId)) break;
      depth += 1;
      guard.add(parentId);
      current = map.get(parentId)!.message;
    }
    depthCache.set(id, depth);
    return depth;
  };

  const detachedRootIds = new Set(
    repoItems.flatMap((item) =>
      item.parentId === null &&
      item.message?.id &&
      getDetachedFromMessageId(item.message)
        ? [item.message.id]
        : [],
    ),
  );

  const baseNodes = repoItems.map((item, index) => {
    const id = String(item.message?.id ?? index);
    const parentId = item.parentId ?? null;
    const message = item.message;
    const branchId =
      message && typeof message === "object" && "branchId" in message
        ? (message as { branchId?: unknown }).branchId
        : undefined;
    const metadataCustom =
      (message && typeof message === "object" && "metadata" in message
        ? ((message as { metadata?: { custom?: Record<string, unknown> } }).metadata?.custom ?? {})
        : {}) as Record<string, unknown>;
    const editedFromValue = metadataCustom[ASSISTANT_EDIT_METADATA_KEY];
    const editedFromId = typeof editedFromValue === "string" ? editedFromValue : null;
    const isBridge = bridgeNodeIds.has(id);
    const customModel = typeof metadataCustom.model === "string" ? metadataCustom.model : null;
    const customProvider = typeof metadataCustom.provider === "string" ? metadataCustom.provider : null;
    const contextScope =
      metadataCustom.contextScope === "parent" ||
      metadataCustom.contextScope === "branch" ||
      metadataCustom.contextScope === "tree"
        ? metadataCustom.contextScope
        : null;
    const registryEntry = id ? getModelEntry(id) : undefined;
    const model = customModel ?? registryEntry?.model ?? null;
    const provider = customProvider ?? registryEntry?.provider ?? null;
    const effectiveParent = getParentId(id, parentId);

    return {
      id,
      parentId: effectiveParent,
      role: String(item.message?.role ?? ""),
      text: extractText(item.message),
      depth: effectiveParent === null ? 0 : getDepth(item.message),
      idx: index,
      branchId,
      editedFromId,
      isBridge,
      model,
      provider,
      contextScope,
    } satisfies Node;
  });

  if (baseNodes.length === 0) return baseNodes;

  const rootChildren = baseNodes.filter(
    (node) => node.parentId === null && !detachedRootIds.has(node.id),
  );
  if (rootChildren.length === 0) return baseNodes;

  rootChildren.forEach((node) => {
    node.parentId = ROOT_NODE_ID;
    node.depth += 1;
  });

  const rootNode: Node = {
    id: ROOT_NODE_ID,
    parentId: null,
    role: "ROOT",
    text: ROOT_NODE_LABEL,
    depth: 0,
    idx: -1,
    branchId: null,
    isBridge: false,
  };

  return [rootNode, ...baseNodes];
};
