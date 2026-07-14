import { describe, expect, it } from "vitest";
import { createSerialTaskQueue } from "@/lib/client/persisted-resource-client";

describe("createSerialTaskQueue", () => {
  it("runs tasks strictly in submission order", async () => {
    const events: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const enqueue = createSerialTaskQueue<string>("fallback");

    const first = enqueue(async () => {
      events.push("first:start");
      await firstGate;
      events.push("first:end");
      return "first";
    });
    const second = enqueue(async () => {
      events.push("second");
      return "second";
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("continues processing after a rejected task", async () => {
    const enqueue = createSerialTaskQueue<number>(0);
    await expect(
      enqueue(async () => {
        throw new Error("save failed");
      }),
    ).rejects.toThrow("save failed");
    await expect(enqueue(async () => 42)).resolves.toBe(42);
  });
});
