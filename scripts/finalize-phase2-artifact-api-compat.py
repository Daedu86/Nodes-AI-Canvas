from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:220]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "components/assistant-ui/thread-graph-flow/use-canvas-run-manager.ts",
    '''  updateArtifact: UpdateArtifact;
  updateArtifactAndPersist: UpdateArtifactAndPersist;
}) {
''',
    '''  updateArtifact: UpdateArtifact;
  updateArtifactAndPersist?: UpdateArtifactAndPersist;
}) {
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/use-canvas-run-manager.ts",
    '''  const updateArtifactRef = React.useRef(updateArtifact);
  const updateArtifactAndPersistRef = React.useRef(updateArtifactAndPersist);
  const applyCompletedResponseRef = React.useRef(applyCompletedResponse);
''',
    '''  const updateArtifactRef = React.useRef(updateArtifact);
  const updateArtifactAndPersistRef = React.useRef<UpdateArtifactAndPersist>(
    updateArtifactAndPersist ??
      (async (...args) => {
        updateArtifact(...args);
      }),
  );
  const applyCompletedResponseRef = React.useRef(applyCompletedResponse);
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/use-canvas-run-manager.ts",
    '''  React.useEffect(() => {
    updateArtifactAndPersistRef.current = updateArtifactAndPersist;
  }, [updateArtifactAndPersist]);
''',
    '''  React.useEffect(() => {
    updateArtifactAndPersistRef.current =
      updateArtifactAndPersist ??
      (async (...args) => {
        updateArtifact(...args);
      });
  }, [updateArtifact, updateArtifactAndPersist]);
''',
)
