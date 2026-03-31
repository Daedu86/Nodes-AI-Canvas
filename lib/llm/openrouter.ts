import { createOpenAI } from "@ai-sdk/openai";
import {
  getOpenRouterApiKey,
  getOpenRouterMetadataHeaders,
  OPENROUTER_BASE_URL,
} from "./config";

export const openrouterClient = createOpenAI({
  baseURL: OPENROUTER_BASE_URL,
  apiKey: getOpenRouterApiKey(),
  headers: getOpenRouterMetadataHeaders(),
});
