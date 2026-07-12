# Chat API request boundary

`POST /api/chat` is intentionally a thin Next.js route. Authentication remains at the route boundary and the rest of the workflow is split into server modules:

- `lib/server/chat/request.ts` parses, bounds, validates, and normalizes the request.
- `lib/server/chat/handler.ts` loads user configuration, applies quota controls, and creates the audit context.
- `lib/server/chat/executor.ts` resolves providers, creates model messages, streams the response, and applies model fallbacks.

## Strict envelope

The JSON envelope only accepts these top-level properties:

- `messages`
- `system`
- `tools`
- `runConfig`
- `metadata`
- `historyMode`
- `model`
- `provider`

Unknown top-level fields and unknown model-resolution fields are rejected with HTTP 400 before user settings are loaded or chat quota is consumed.

The validator also enforces bounded counts and sizes for messages, parts, tools, system instructions, and context artifacts. Requests larger than 20 MB are rejected with HTTP 413.

## Extensible messages

Assistant UI and AI SDK message objects are extensible. Message roles, required content, part counts, and part type identifiers are validated, while additional message and part metadata remains allowed. This preserves UI message stream compatibility without making the HTTP control envelope permissive.

## Validation errors

Validation errors return JSON with a stable error code and a bounded list of field paths:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "The chat request payload is invalid.",
    "issues": [
      {
        "path": "provider",
        "message": "Invalid option"
      }
    ]
  }
}
```

The same safe message is copied to the existing `x-nodes-error-message` header so the current Assistant UI error surface can display it without parsing the response body.
