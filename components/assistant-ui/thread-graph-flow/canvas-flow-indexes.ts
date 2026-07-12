import type {
  SessionArtifact,
  SessionCanvasLink,
} from "@/lib/session-artifacts";
import type {
  CanvasFlowIndexes,
  CanvasPromptLinkCount,
} from "@/components/assistant-ui/thread-graph-flow/canvas-flow-elements-types";

const incrementPromptLinkCount = (
  counts: Map<string, CanvasPromptLinkCount>,
  promptId: string,
  relation: SessionCanvasLink["relation"],
) => {
  const current = counts.get(promptId) ?? { context: 0, output: 0 };
  if (relation === "context") {
    current.context += 1;
  } else {
    current.output += 1;
  }
  counts.set(promptId, current);
};

export function buildCanvasFlowIndexes(
  canvasLinks: readonly SessionCanvasLink[],
  artifactIndex: ReadonlyMap<string, SessionArtifact>,
): CanvasFlowIndexes {
  const linkedArtifactIdsByTarget = new Map<string, Set<string>>();
  const promptLinkCountById = new Map<string, CanvasPromptLinkCount>();

  for (const link of canvasLinks) {
    if (link.promptId) {
      incrementPromptLinkCount(promptLinkCountById, link.promptId, link.relation);
    }
    if (
      link.relation !== "context" ||
      !link.promptId ||
      !artifactIndex.has(link.artifactId)
    ) {
      continue;
    }

    const linkedArtifactIds =
      linkedArtifactIdsByTarget.get(link.promptId) ?? new Set<string>();
    linkedArtifactIds.add(link.artifactId);
    linkedArtifactIdsByTarget.set(link.promptId, linkedArtifactIds);
  }

  const linkedArtifactCountByTarget = new Map<string, number>();
  for (const [targetId, artifactIds] of linkedArtifactIdsByTarget) {
    linkedArtifactCountByTarget.set(targetId, artifactIds.size);
  }

  return {
    linkedArtifactCountByTarget,
    promptLinkCountById,
  };
}
