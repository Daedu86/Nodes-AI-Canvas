import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import {
  getProjectForUser,
  patchProjectForUser,
  ProjectAccessError,
} from "../lib/project-collaboration";
import { createMemoryItem } from "../lib/memory-store";
import { createProject, upsertProjectMember } from "../lib/project-store";
import { createSession } from "../lib/session-store";

const owner = {
  email: "owner@example.com",
  id: "owner-1",
  name: "Owner",
};

const editor = {
  email: "editor@example.com",
  id: "editor-1",
  name: "Editor",
};

const viewer = {
  email: "viewer@example.com",
  id: "viewer-1",
  name: "Viewer",
};

describe("project collaboration", () => {
  let projectDir = "";
  let sessionDir = "";
  let memoryDir = "";
  const originalProjectStoreDir = process.env.PROJECT_STORE_DIR;
  const originalSessionStoreDir = process.env.SESSION_STORE_DIR;
  const originalMemoryStoreDir = process.env.PROJECT_MEMORY_STORE_DIR;

  beforeEach(async () => {
    projectDir = await mkdtemp(path.join(os.tmpdir(), "nodes-project-collab-projects-"));
    sessionDir = await mkdtemp(path.join(os.tmpdir(), "nodes-project-collab-sessions-"));
    memoryDir = await mkdtemp(path.join(os.tmpdir(), "nodes-project-collab-memory-"));
    process.env.PROJECT_STORE_DIR = projectDir;
    process.env.SESSION_STORE_DIR = sessionDir;
    process.env.PROJECT_MEMORY_STORE_DIR = memoryDir;
  });

  afterEach(async () => {
    if (originalProjectStoreDir === undefined) {
      delete process.env.PROJECT_STORE_DIR;
    } else {
      process.env.PROJECT_STORE_DIR = originalProjectStoreDir;
    }
    if (originalSessionStoreDir === undefined) {
      delete process.env.SESSION_STORE_DIR;
    } else {
      process.env.SESSION_STORE_DIR = originalSessionStoreDir;
    }
    if (originalMemoryStoreDir === undefined) {
      delete process.env.PROJECT_MEMORY_STORE_DIR;
    } else {
      process.env.PROJECT_MEMORY_STORE_DIR = originalMemoryStoreDir;
    }

    await Promise.all([
      projectDir ? rm(projectDir, { recursive: true, force: true }) : Promise.resolve(),
      sessionDir ? rm(sessionDir, { recursive: true, force: true }) : Promise.resolve(),
      memoryDir ? rm(memoryDir, { recursive: true, force: true }) : Promise.resolve(),
    ]);
  });

  it("hydrates shared projects with attached sessions and typed nodes for viewers", async () => {
    const session = await createSession({
      ownerId: owner.id,
      title: "Exploration session",
    });
    const memory = await createMemoryItem({
      content: "Shared synthesis",
      ownerId: owner.id,
      title: "Shared summary",
      type: "summary",
    });
    const project = await createProject({
      memoryIds: [memory.id],
      ownerId: owner.id,
      sessionIds: [session.id],
      title: "Collaborative review",
    });

    await upsertProjectMember(project.id, {
      email: viewer.email,
      role: "viewer",
    }, owner.id);

    const sharedProject = await getProjectForUser(project.id, viewer);
    expect(sharedProject.accessRole).toBe("viewer");
    expect(sharedProject.members).toEqual([
      expect.objectContaining({
        email: viewer.email,
        role: "viewer",
      }),
    ]);
    expect(sharedProject.sessions?.map((entry) => entry.id)).toEqual([session.id]);
    expect(sharedProject.attachedMemoryItems?.map((entry) => entry.id)).toEqual([memory.id]);
  });

  it("lets editors update shared context but blocks structural changes", async () => {
    const project = await createProject({
      globalContext: "Initial context",
      ownerId: owner.id,
      title: "Editable project",
    });

    await upsertProjectMember(project.id, {
      email: editor.email,
      role: "editor",
    }, owner.id);

    const updated = await patchProjectForUser(project.id, {
      globalContext: "Updated by editor",
      title: "Updated title",
    }, editor);

    expect(updated.accessRole).toBe("editor");
    expect(updated.globalContext).toBe("Updated by editor");
    expect(updated.title).toBe("Updated title");

    await expect(
      patchProjectForUser(project.id, { sessionIds: ["session-1"] }, editor),
    ).rejects.toBeInstanceOf(ProjectAccessError);
  });
});
