import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.resolve(process.cwd(), "scripts", "seed-product-demo.mjs");

const readJson = async (filePath: string) =>
  JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;

describe("product demo seed", () => {
  let rootDir = "";
  let sessionDir = "";
  let projectDir = "";
  let memoryDir = "";
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodes-product-demo-"));
    sessionDir = path.join(rootDir, "sessions");
    projectDir = path.join(rootDir, "projects");
    memoryDir = path.join(rootDir, "memory");
    env = {
      ...process.env,
      AUTH_DEV_EMAIL: "presenter@example.com",
      NODES_PERSISTENCE_BACKEND: "file",
      PROJECT_MEMORY_STORE_DIR: memoryDir,
      PROJECT_STORE_DIR: projectDir,
      SESSION_STORE_DIR: sessionDir,
    };
    delete env.NODES_DEMO_OWNER_ID;
  });

  afterEach(async () => {
    if (rootDir) {
      await fs.rm(rootDir, { recursive: true, force: true });
    }
  });

  it("creates, reuses, and selectively removes the deterministic demo workspace", async () => {
    const first = await execFileAsync(process.execPath, [scriptPath], { env });
    expect(first.stdout).toContain("Nodes product demo seeded.");
    expect(first.stdout).toContain("Owner: dev:presenter@example.com");

    const projectPath = path.join(projectDir, "demo-nodes-product-launch.json");
    const positioningPath = path.join(sessionDir, "demo-positioning.json");
    const memoryPath = path.join(memoryDir, "demo-memory-positioning-decision.json");

    const project = await readJson(projectPath);
    expect(project).toMatchObject({
      arenaWinnerSessionId: "demo-positioning",
      memoryIds: [
        "demo-memory-positioning-decision",
        "demo-memory-research-evidence",
        "demo-memory-launch-summary",
      ],
      ownerId: "dev:presenter@example.com",
      sessionIds: ["demo-positioning", "demo-onboarding", "demo-launch-plan"],
      title: "[Demo] Nodes product launch",
    });

    const positioning = await readJson(positioningPath);
    expect(positioning.ownerId).toBe("dev:presenter@example.com");
    expect(positioning.snapshot).toMatchObject({
      headId: "positioning-assistant-decision",
      messages: expect.arrayContaining([
        expect.objectContaining({ parentId: "positioning-assistant-options" }),
      ]),
    });
    expect(positioning.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ semanticType: "evidence" }),
        expect.objectContaining({ semanticType: "decision" }),
      ]),
    );

    const memory = await readJson(memoryPath);
    expect(memory).toMatchObject({
      ownerId: "dev:presenter@example.com",
      sourceProjectId: "demo-nodes-product-launch",
      sourceSessionId: "demo-positioning",
      type: "decision",
    });

    const unrelatedPath = path.join(sessionDir, "unrelated.json");
    await fs.writeFile(unrelatedPath, "{}", "utf8");

    const second = await execFileAsync(process.execPath, [scriptPath], { env });
    expect(second.stdout).toContain("already seeded");

    const cleaned = await execFileAsync(process.execPath, [scriptPath, "--clean"], { env });
    expect(cleaned.stdout).toContain("Removed the Nodes product demo");

    await expect(fs.access(projectPath)).rejects.toThrow();
    await expect(fs.access(positioningPath)).rejects.toThrow();
    await expect(fs.access(memoryPath)).rejects.toThrow();
    await expect(fs.access(unrelatedPath)).resolves.toBeUndefined();
  });

  it("rejects Supabase mode instead of writing local demo records", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        env: { ...env, NODES_PERSISTENCE_BACKEND: "supabase" },
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("writes only to the local file backend"),
    });
  });
});
