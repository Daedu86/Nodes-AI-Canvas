import type { Node } from "@/components/assistant-ui/thread-graph/graph-types";
import { ROOT_NODE_ID } from "@/components/assistant-ui/thread-graph/graph-types";

export type BranchOperation =
  | "new-root-prompt"
  | "create-sibling-prompt"
  | "create-follow-up-prompt";

export type BranchOperationDetail = {
  operation: BranchOperation;
  title: string;
  description: string;
  placeholder: string;
  submitLabel: string;
};

export type BranchAnchor = Pick<Node, "id" | "parentId" | "role" | "isBridge">;

export type BranchSpec = {
  operation: BranchOperation;
  anchorId: string;
  anchorRole: string;
  parentId: string | null;
  sourceId: string | null;
  targetRole: "user";
  startRun: true;
  placeholder: string;
  title: string;
};

export const BRANCH_OPERATION_DETAILS: Record<BranchOperation, BranchOperationDetail> = {
  "new-root-prompt": {
    operation: "new-root-prompt",
    title: "New root prompt",
    description: "Create a new top-level user branch from the conversation root.",
    placeholder: "Start another top-level branch...",
    submitLabel: "Create root branch",
  },
  "create-sibling-prompt": {
    operation: "create-sibling-prompt",
    title: "Alternative prompt",
    description: "Create a sibling user prompt under the same parent branch.",
    placeholder: "Write an alternative user prompt...",
    submitLabel: "Create sibling branch",
  },
  "create-follow-up-prompt": {
    operation: "create-follow-up-prompt",
    title: "Follow-up prompt",
    description: "Create a follow-up user prompt beneath this assistant reply.",
    placeholder: "Write a follow-up prompt...",
    submitLabel: "Create follow-up",
  },
};

const normalizeRuntimeParentId = (parentId: string | null) =>
  parentId === ROOT_NODE_ID ? null : parentId;

const isRootAnchor = (anchor: BranchAnchor) => anchor.id === ROOT_NODE_ID;

export const getAllowedBranchOperations = (anchor: BranchAnchor): BranchOperation[] => {
  if (anchor.isBridge) {
    return [];
  }

  if (isRootAnchor(anchor)) {
    return ["new-root-prompt"];
  }

  if (anchor.role === "user") {
    return ["create-sibling-prompt"];
  }

  if (anchor.role === "assistant") {
    return ["create-follow-up-prompt"];
  }

  return [];
};

export const getBranchOperationDetail = (operation: BranchOperation) =>
  BRANCH_OPERATION_DETAILS[operation];

export const buildBranchSpec = (
  anchor: BranchAnchor,
  operation: BranchOperation,
): BranchSpec | null => {
  if (!getAllowedBranchOperations(anchor).includes(operation)) {
    return null;
  }

  const detail = getBranchOperationDetail(operation);

  switch (operation) {
    case "new-root-prompt":
      return {
        operation,
        anchorId: anchor.id,
        anchorRole: anchor.role,
        parentId: null,
        sourceId: null,
        targetRole: "user",
        startRun: true,
        placeholder: detail.placeholder,
        title: detail.title,
      };

    case "create-sibling-prompt":
      return {
        operation,
        anchorId: anchor.id,
        anchorRole: anchor.role,
        parentId: normalizeRuntimeParentId(anchor.parentId),
        sourceId: anchor.id,
        targetRole: "user",
        startRun: true,
        placeholder: detail.placeholder,
        title: detail.title,
      };

    case "create-follow-up-prompt":
      return {
        operation,
        anchorId: anchor.id,
        anchorRole: anchor.role,
        parentId: anchor.id,
        sourceId: null,
        targetRole: "user",
        startRun: true,
        placeholder: detail.placeholder,
        title: detail.title,
      };

    default:
      return null;
  }
};
