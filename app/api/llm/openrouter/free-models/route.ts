import { OPENROUTER_BASE_URL } from "@/lib/llm/config";
import { requireLocalApiUser } from "@/lib/server/request-guards";

export const runtime = "nodejs";

const FREE_ROUTER_MODEL = {
  contextLength: null,
  created: null,
  description: "OpenRouter's free-model router. Routes to an available free model.",
  id: "openrouter/free",
  name: "OpenRouter: Free Router",
};

type OpenRouterRawModel = {
  id?: unknown;
  name?: unknown;
  created?: unknown;
  description?: unknown;
  context_length?: unknown;
  architecture?: {
    input_modalities?: unknown;
    output_modalities?: unknown;
  };
  pricing?: {
    prompt?: unknown;
    completion?: unknown;
  };
};

type OpenRouterModelsResponse = {
  data?: unknown;
};

const asString = (value: unknown) => (typeof value === "string" ? value : "");
const asNumberOrNull = (value: unknown) => (typeof value === "number" ? value : null);

const hasTextInput = (model: OpenRouterRawModel) => {
  const modalities = model.architecture?.input_modalities;
  if (!Array.isArray(modalities)) return true;
  return modalities.includes("text");
};

const hasTextOutput = (model: OpenRouterRawModel) => {
  const modalities = model.architecture?.output_modalities;
  if (!Array.isArray(modalities)) return true;
  return modalities.includes("text");
};

const isZeroPrice = (value: unknown) => typeof value === "string" && Number(value) === 0;

const isFreeTextModel = (model: OpenRouterRawModel) => {
  const id = asString(model.id);
  if (!id) return false;
  const price = model.pricing ?? {};
  const freeByPrice = isZeroPrice(price.prompt) && isZeroPrice(price.completion);
  return (id.endsWith(":free") || freeByPrice) && hasTextInput(model) && hasTextOutput(model);
};

export async function GET(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL.replace(/\/$/, "")}/models`, {
      headers: {
        Accept: "application/json",
      },
      next: {
        revalidate: 300,
      },
    });

    if (!response.ok) {
      return Response.json(
        { error: `OpenRouter model catalog failed: ${response.status}`, models: [FREE_ROUTER_MODEL] },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as OpenRouterModelsResponse;
    const rawModels = Array.isArray(payload.data) ? payload.data : [];
    const models = rawModels
      .filter((entry): entry is OpenRouterRawModel => Boolean(entry) && typeof entry === "object")
      .filter(isFreeTextModel)
      .map((model) => ({
        contextLength: asNumberOrNull(model.context_length),
        created: asNumberOrNull(model.created),
        description: asString(model.description),
        id: asString(model.id),
        name: asString(model.name) || asString(model.id),
      }))
      .filter((model) => model.id !== FREE_ROUTER_MODEL.id)
      .sort((a, b) => {
        const bCreated = b.created ?? 0;
        const aCreated = a.created ?? 0;
        if (bCreated !== aCreated) return bCreated - aCreated;
        return a.name.localeCompare(b.name);
      });

    return Response.json(
      {
        fetchedAt: new Date().toISOString(),
        models: [FREE_ROUTER_MODEL, ...models],
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  } catch (error) {
    console.error("Failed to load OpenRouter free models", error);
    return Response.json(
      { error: "Failed to load OpenRouter free models", models: [FREE_ROUTER_MODEL] },
      { status: 502 },
    );
  }
}
