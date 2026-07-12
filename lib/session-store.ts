import { getSessionRepository } from "@/lib/persistence/repositories";
import type {
  SessionCreateInput,
  SessionListOptions,
  SessionPatch,
  SessionPatchOptions,
} from "@/lib/persistence/session-repository";

export type {
  SessionCreateInput,
  SessionListOptions,
  SessionPatch,
  SessionPatchOptions,
};

export async function listSessions(options: SessionListOptions = {}) {
  return getSessionRepository().listSessions(options);
}

export async function getSession(sessionId: string, ownerId?: string) {
  return getSessionRepository().getSession(sessionId, ownerId);
}

export async function createSession(input: SessionCreateInput = {}) {
  return getSessionRepository().createSession(input);
}

export async function patchSession(
  sessionId: string,
  patch: SessionPatch,
  options: SessionPatchOptions,
) {
  return getSessionRepository().patchSession(sessionId, patch, options);
}

export async function deleteSession(sessionId: string, ownerId?: string) {
  return getSessionRepository().deleteSession(sessionId, ownerId);
}

export async function deleteSessions(sessionIds: string[], ownerId?: string) {
  return getSessionRepository().deleteSessions(sessionIds, ownerId);
}

export async function getSessionBlobMaintenanceSummary() {
  return getSessionRepository().getSessionBlobMaintenanceSummary();
}

export async function cleanupSessionBlobStore() {
  return getSessionRepository().cleanupBlobStore();
}
