import { z } from "zod";
import {
  getRequestedModelConfig,
  type ResolvedModelConfig,
} from "@/lib/llm/config";
import {
  normalizeMessages,
  selectMessagesForHistoryMode,
  type NormalizedLlmMessage,
} from "@/lib/llm/messages";
import { LLM_PROVIDER_IDS } from "@/lib/llm/provider-catalog";
import {
  REQUEST_ERROR_CODE_HEADER,
  REQUEST_ERROR_MESSAGE_HEADER,
} from "@/lib/llm/request-errors";
import {
  normalizeLlmContextArtifacts,
  type LlmContextArtifact,
} from "@/lib/session-artifacts";

const MAX_CHAT_REQUEST_BYTES = 20 * 1024 * 1024;
const MAX_CHAT_MESSAGES = 250;
const MAX_MESSAGE_PARTS = 64;
const MAX_TOOLS = 64;
const MAX_CONTEXT_ARTIFACTS = 32;
const MAX_SYSTEM_CHARS = 64 * 1024;
const MAX_TEXT_CONTENT_CHARS = 512 * 1024;
const MAX_ARTIFACT_CONTENT_CHARS = 2 * 1024 * 1024;

export const CHAT_REQUEST_ID_HEADER = "x-nodes-request-id";
export const INVALID_CHAT_REQUEST_CODE = "invalid_request";

const providerSchema = z.enum(LLM_PROVIDER_IDS);
const historyModeSchema = z.enum(["last", "full"]);
const chatTriggerSchema = z.enum(["submit-message", "regenerate-message"]);
const boundedIdentifierSchema = z.string().trim().min(1).max(256);
const optionalNullableStringSchema = z.string().max(2_048).nullable().optional();

const contextArtifactSchema = z
  .object({
    id: boundedIdentifierSchema,
    title: z.string().trim().min(1).max(512),
    artifactType: z.enum(["text", "code", "image", "file", "prompt"]),
    semanticType: z
      .enum(["decision", "evidence", "plan", "table", "question", "draft"])
      .nullable()
      .optional(),
    byteSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    content: z.string().max(MAX_ARTIFACT_CONTENT_CHARS),
    fileName: optionalNullableStringSchema,
    language: optionalNullableStringSchema,
    mimeType: optionalNullableStringSchema,
  })
  .strict();

const modelResolutionCustomSchema = z
  .object({
    contextArtifacts: z.array(contextArtifactSchema).max(MAX_CONTEXT_ARTIFACTS).optional(),
    historyMode: historyModeSchema.optional(),
    model: boundedIdentifierSchema.optional(),
    provider: providerSchema.optional(),
  })
  .strict();

const modelResolutionSchema = z
  .object({
    historyMode: historyModeSchema.optional(),
    custom: modelResolutionCustomSchema.optional(),
    model: boundedIdentifierSchema.optional(),
    provider: providerSchema.optional(),
  })
  .strict();

const messagePartSchema = z
  .object({
    type: z.string().trim().min(1).max(128),
  })
  .catchall(z.unknown());

const messageContentSchema = z.union([
  z.string().max(MAX_TEXT_CONTENT_CHARS),
  z.array(messagePartSchema).max(MAX_MESSAGE_PARTS),
]);

const chatMessageSchema = z
  .object({
    id: z.string().trim().min(1).max(256).optional(),
    role: z.enum(["system", "user", "assistant"]),
    content: messageContentSchema.optional(),
    parts: z.array(messagePartSchema).max(MAX_MESSAGE_PARTS).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.union([z.string().max(128), z.number().finite()]).optional(),
  })
  .catchall(z.unknown())
  .superRefine((message, context) => {
    const hasContent =
      typeof message.content === "string"
        ? message.content.length > 0
        : Array.isArray(message.content) && message.content.length > 0;
    const hasParts = Array.isArray(message.parts) && message.parts.length > 0;
    if (!hasContent && !hasParts) {
      context.addIssue({
        code: "custom",
        message: "Each message must contain content or at least one part.",
        path: ["content"],
      });
    }
  });

const toolsSchema = z
  .record(z.string().trim().min(1).max(128), z.unknown())
  .superRefine((tools, context) => {
    if (Object.keys(tools).length > MAX_TOOLS) {
      context.addIssue({
        code: "custom",
        message: `A maximum of ${MAX_TOOLS} frontend tools is allowed.`,
      });
    }
  });

export const chatRequestBodySchema = z
  .object({
    id: boundedIdentifierSchema.optional(),
    messages: z.array(chatMessageSchema).max(MAX_CHAT_MESSAGES).default([]),
    system: z.string().max(MAX_SYSTEM_CHARS).optional(),
    tools: toolsSchema.optional(),
    trigger: chatTriggerSchema.optional(),
    runConfig: modelResolutionSchema.optional(),
    metadata: modelResolutionSchema.optional(),
    historyMode: historyModeSchema.optional(),
    model: boundedIdentifierSchema.optional(),
    provider: providerSchema.optional(),
  })
  .strict();

export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;
export type ChatHistoryMode = z.infer<typeof historyModeSchema>;

export type PreparedChatRequest = {
  body: ChatRequestBody;
  contextArtifacts: LlmContextArtifact[];
  historyMode: ChatHistoryMode | undefined;
  messages: NormalizedLlmMessage[];
  messagesToSend: NormalizedLlmMessage[];
  rawMessages: ChatRequestBody["messages"];
  requestedModel: ResolvedModelConfig;
  system: string | undefined;
  tools: Record<string, unknown> | undefined;
};

type ChatRequestParseResult =
  | { ok: true; body: ChatRequestBody }
  | { ok: false; response: Response };

const getUtf8ByteLength = (value: string) => new TextEncoder().encode(value).byteLength;

const formatIssuePath = (path: readonly PropertyKey[]) =>
  path.length > 0 ? path.map((part) => String(part)).join(".") : "$";

const createValidationResponse = (options: {
  message: string;
  status: 400 | 413;
  issues?: Array<{ message: string; path: string }>;
}) => {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
  });
  headers.set(REQUEST_ERROR_CODE_HEADER, INVALID_CHAT_REQUEST_CODE);
  headers.set(REQUEST_ERROR_MESSAGE_HEADER, options.message);

  return new Response(
    JSON.stringify({
      error: {
        code: INVALID_CHAT_REQUEST_CODE,
        message: options.message,
        ...(options.issues?.length ? { issues: options.issues } : {}),
      },
    }),
    {
      headers,
      status: options.status,
    },
  );
};

export async function parseChatRequest(req: Request): Promise<ChatRequestParseResult> {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CHAT_REQUEST_BYTES) {
    return {
      ok: false,
      response: createValidationResponse({
        message: "The chat request is too large.",
        status: 413,
      }),
    };
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return {
      ok: false,
      response: createValidationResponse({
        message: "The chat request body could not be read.",
        status: 400,
      }),
    };
  }

  if (getUtf8ByteLength(rawBody) > MAX_CHAT_REQUEST_BYTES) {
    return {
      ok: false,
      response: createValidationResponse({
        message: "The chat request is too large.",
        status: 413,
      }),
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      response: createValidationResponse({
        message: "Invalid JSON body.",
        status: 400,
      }),
    };
  }

  const result = chatRequestBodySchema.safeParse(parsedJson);
  if (!result.success) {
    return {
      ok: false,
      response: createValidationResponse({
        message: "The chat request payload is invalid.",
        status: 400,
        issues: result.error.issues.slice(0, 12).map((issue) => ({
          message: issue.message,
          path: formatIssuePath(issue.path),
        })),
      }),
    };
  }

  return { ok: true, body: result.data };
}

export function prepareChatRequest(body: ChatRequestBody): PreparedChatRequest {
  const rawMessages = body.messages;
  const messages = normalizeMessages(rawMessages);
  const contextArtifacts = normalizeLlmContextArtifacts(
    body.metadata?.custom?.contextArtifacts ??
      body.runConfig?.custom?.contextArtifacts,
  );
  const historyMode =
    body.metadata?.custom?.historyMode ??
    body.metadata?.historyMode ??
    body.runConfig?.custom?.historyMode ??
    body.runConfig?.historyMode ??
    body.historyMode;

  return {
    body,
    contextArtifacts,
    historyMode,
    messages,
    messagesToSend: selectMessagesForHistoryMode(messages, historyMode),
    rawMessages,
    requestedModel: getRequestedModelConfig(body),
    system: body.system,
    tools: body.tools,
  };
}
