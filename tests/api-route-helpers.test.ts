import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ProjectAccessError } from "../lib/project-collaboration";
import { ProjectInvitationError } from "../lib/project-invitation-service";
import {
  apiError,
  jsonNoStore,
  parseJsonBody,
} from "../lib/server/api-response";
import { projectInvitationErrorResponse } from "../lib/server/project-invitation-http";

const jsonRequest = (body: string) =>
  new Request("http://localhost/api/test", {
    body,
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

describe("API response helpers", () => {
  it("forces no-store while preserving response options", async () => {
    const response = jsonNoStore(
      { created: true },
      {
        headers: {
          "Cache-Control": "public, max-age=60",
          "X-Test": "preserved",
        },
        status: 201,
      },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Test")).toBe("preserved");
    expect(await response.json()).toEqual({ created: true });
  });

  it("creates a consistent API error body", async () => {
    const response = apiError({
      code: "invalid_request",
      error: "The request is invalid.",
      status: 400,
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      code: "invalid_request",
      error: "The request is invalid.",
    });
  });

  it("parses and validates JSON bodies", async () => {
    const result = await parseJsonBody(
      jsonRequest(JSON.stringify({ token: "abc" })),
      z.object({ token: z.string().min(1) }).strict(),
      {
        code: "invalid_token",
        error: "A token is required.",
        status: 400,
      },
    );

    expect(result).toEqual({ data: { token: "abc" }, ok: true });
  });

  it("rejects malformed or schema-invalid JSON consistently", async () => {
    const malformed = await parseJsonBody(
      jsonRequest("{"),
      z.object({ token: z.string().min(1) }).strict(),
      {
        code: "invalid_token",
        error: "A token is required.",
        status: 400,
      },
    );

    expect(malformed.ok).toBe(false);
    if (malformed.ok) throw new Error("Expected malformed JSON to be rejected");
    expect(malformed.response.status).toBe(400);
    expect(await malformed.response.json()).toEqual({
      code: "invalid_token",
      error: "A token is required.",
    });
  });
});

describe("projectInvitationErrorResponse", () => {
  const fallback = {
    code: "project_not_found",
    error: "Project not found",
    status: 404,
  } as const;

  it("maps invitation domain errors", async () => {
    const response = projectInvitationErrorResponse(
      new ProjectInvitationError(
        "invitation_expired",
        "The invitation has expired.",
        410,
      ),
      fallback,
    );

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      code: "invitation_expired",
      error: "The invitation has expired.",
    });
  });

  it("maps project access errors", async () => {
    const response = projectInvitationErrorResponse(
      new ProjectAccessError("Only the owner can manage invitations.", 403),
      fallback,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: "project_access_denied",
      error: "Only the owner can manage invitations.",
    });
  });

  it("uses the supplied fallback for unknown errors", async () => {
    const response = projectInvitationErrorResponse(new Error("database offline"), fallback);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      code: "project_not_found",
      error: "Project not found",
    });
  });
});
