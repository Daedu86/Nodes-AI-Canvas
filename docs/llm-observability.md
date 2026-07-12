# LLM observability

The chat route emits structured JSON lifecycle events that can be queried in Vercel runtime logs or forwarded to another log sink.

## Privacy boundary

Observability events never contain:

- Prompt or response text.
- Tool arguments or results.
- Artifact contents or file data.
- API keys, authorization headers, or provider payloads.
- User IDs, email addresses, agent token IDs, or display names.
- Raw exception messages.

Requests are correlated only through the random `requestId` already returned in the `x-nodes-request-id` response header. The event records only whether the caller was a user or an agent.

Set `NODES_LLM_OBSERVABILITY=0` to disable lifecycle events and AI SDK telemetry. Observability is enabled by default.

## Event lifecycle

A normal streamed request produces:

1. `request_accepted` after quota and concurrency reservation.
2. `attempt_started` for each provider/model attempt.
3. `first_token` when the first non-empty text or reasoning delta arrives.
4. `request_completed` when the stream finishes.

Other outcomes produce:

- `request_rejected` for concurrency or usage limits.
- `fallback_applied` before retrying a supported OpenRouter failure with the next model.
- `request_cancelled` when the client aborts or the streaming runtime aborts.
- `request_failed` for terminal provider, credential, or backend failures.

## Latency fields

Terminal and first-token events include:

- `durationMs`: end-to-end time since the route accepted the parsed request.
- `providerDurationMs`: time since the current model attempt began.
- `timeToFirstChunkMs`: end-to-end time until any stream chunk.
- `timeToFirstTokenMs`: end-to-end time until textual or reasoning output.
- `providerTimeToFirstChunkMs`: provider-attempt-relative first chunk time.
- `providerTimeToFirstTokenMs`: provider-attempt-relative first token time.

This separation prevents authentication, settings lookup, and quota reservation time from being attributed to the model provider.

## Usage fields

Completed events normalize the aggregate AI SDK usage object into counters only:

- `inputTokens`
- `outputTokens`
- `totalTokens`
- `textTokens`
- `reasoningTokens`
- `cacheReadTokens`
- `cacheWriteTokens`

Aggregate `totalUsage` is preferred over the last-step `usage` value. Raw provider usage and provider metadata are intentionally discarded.

## Quota fields

Accepted and rejected events contain:

- Plan.
- Active run count and concurrent limit.
- Remaining minute, hour, and day allowance.
- Quota reservation duration.
- Retry delay for rejected requests.

No account identifier is attached to these values.

## Cancellation and lease release

The Next.js request abort signal is passed to `streamText`. Client disconnects and explicit cancellations therefore stop the provider request and release the distributed concurrency lease through the same idempotent finalizer used for success and failure.

Cancellation events classify the source as:

- `client`: the incoming request signal was aborted.
- `runtime`: the AI SDK or provider runtime aborted independently, including internal timeouts.

## AI SDK telemetry

Each provider attempt enables the AI SDK telemetry hook with the function identifier `nodes.chat`. Metadata is limited to the request ID, provider, model ID, attempt number, and fallback state.

`recordInputs` and `recordOutputs` are both disabled. A deployment that registers an OpenTelemetry exporter can therefore receive timing spans without storing prompts, responses, tool payloads, or artifact content.

## Error diagnostics

Diagnostic error logs contain only:

- Request ID.
- Provider and model ID.
- Normalized application error code and HTTP status.
- Exception class name, when available.

Exception messages are excluded because provider errors can echo request content or credentials.

## Release validation

The production build validates the lifecycle event schema, aggregate usage normalization, first-chunk and first-token timing tracker, quota metrics, abort propagation, idempotent lease release, and privacy-focused regression tests. Implementation commits use `[skip vercel]`; this release commit is the single production deployment for the phase.
