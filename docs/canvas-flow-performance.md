# Canvas flow performance

The canvas flow builder converts conversation messages, prompts, artifacts, and links into React Flow nodes and edges before applying the Dagre layout.

## Previous hot paths

The former implementation performed repeated full-array scans while building a single graph:

- Every canvas prompt filtered the complete link collection once for inputs and once for outputs.
- Every conversation node called `getArtifactsForTarget`, which filtered all links and then all artifacts.
- Model palette and labels were calculated separately for each node and its outgoing edge.
- Layout partitioned nodes with two filters and calculated each conversation node size twice.

For `N` messages, `A` artifacts, `P` prompts, and `L` links, the pre-layout preparation could approach `O(P × L + N × (L + A))`.

## Current design

The builder now has four explicit stages:

1. Build link indexes in one pass.
2. Build node groups.
3. Build edge groups.
4. Apply layout.

The indexes provide:

- Unique linked-artifact counts by message or prompt.
- Input and output counts by canvas prompt.

Model visuals are cached per provider/model pair for the duration of the build. Edge builders use loops rather than allocating temporary arrays through `flatMap`. The layout partitions nodes and stores their sizes in one pass.

Preparation outside Dagre is now linear in the graph input: `O(N + A + P + L)`.

## Regression coverage

`tests/canvas-flow-elements.test.ts` verifies:

- Conversation, prompt, and artifact node semantics.
- Context, output, pending-output, and conversation edges.
- Editable edge callbacks.
- Prompt callbacks.
- Unique artifact counts and prompt link counts.
- Dangling artifact links do not inflate visible linked-artifact counts.

## Reproducible benchmark

Run:

```bash
npm run benchmark:canvas
```

The benchmark builds and lays out a deterministic graph containing:

- 1,000 conversation messages, including a deep branch.
- 300 artifacts and prompts.
- 2,000 context and output links.
- 1,300 resulting nodes.
- 2,999 resulting edges.

The benchmark validates the graph shape on every iteration so an optimization cannot improve timing by silently dropping elements.

## Release validation

The production build validates the decomposed builder, layout module, regression suite, and benchmark fixture under the repository's strict TypeScript configuration. The implementation commit uses `[skip vercel]`; this release commit is the single production deployment for the phase.
