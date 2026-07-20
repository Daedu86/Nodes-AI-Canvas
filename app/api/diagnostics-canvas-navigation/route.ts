import { buildCanvasBranchSystemContext } from "@/lib/canvas-branch-direct-run";
import { focusCanvasMessageBranch } from "@/lib/canvas-chat-navigation";

export async function GET() {
  const repository = {
    headId: "assistant-main",
    messages: [
      { parentId: null, message: { id: "user-root" } },
      { parentId: "user-root", message: { id: "assistant-main" } },
      { parentId: "user-root", message: { id: "assistant-sibling" } },
      { parentId: "assistant-sibling", message: { id: "user-sibling-followup" } },
    ],
  };
  const siblingFocused = focusCanvasMessageBranch(repository, "assistant-sibling");
  const descendantFocused = focusCanvasMessageBranch(
    repository,
    "user-sibling-followup",
  );
  const currentPrompt = "resume todo lo que recuerdas";
  const treeSystem =
    buildCanvasBranchSystemContext(
      [
        { id: "color-user", role: "user", content: "recuerda rojo y verde" },
        { id: "color-ai", role: "assistant", content: "rojo y verde" },
        { id: "animal-user", role: "user", content: "recuerda mono y oso" },
        { id: "animal-ai", role: "assistant", content: "mono y oso" },
        { id: "current", role: "user", content: currentPrompt },
      ],
      "tree",
      currentPrompt,
    ) ?? "";

  const checks = {
    siblingBranchBecomesVisibleHead:
      siblingFocused?.headId === "assistant-sibling",
    siblingDescendantBecomesVisibleHead:
      descendantFocused?.headId === "user-sibling-followup",
    repositoryTopologyPreserved:
      siblingFocused?.messages === repository.messages,
    fullTreeHasColorSibling:
      treeSystem.includes("rojo y verde"),
    fullTreeHasAnimalSibling:
      treeSystem.includes("mono y oso"),
    fullTreeDoesNotDuplicateCurrentPrompt:
      treeSystem.split(currentPrompt).length - 1 === 0,
  };

  return Response.json({
    ok: Object.values(checks).every(Boolean),
    checks,
  });
}
