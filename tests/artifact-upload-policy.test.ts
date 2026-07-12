import { afterEach, describe, expect, it } from "vitest";
import {
  getSessionArtifactStorageQuotaBytes,
  validateArtifactUpload,
} from "../lib/artifact-upload-policy";

const ORIGINAL_QUOTA = process.env.NODES_USER_STORAGE_QUOTA_BYTES;

const bytes = (...values: number[]) => new Uint8Array(values);

describe("artifact upload policy", () => {
  afterEach(() => {
    if (ORIGINAL_QUOTA === undefined) {
      delete process.env.NODES_USER_STORAGE_QUOTA_BYTES;
    } else {
      process.env.NODES_USER_STORAGE_QUOTA_BYTES = ORIGINAL_QUOTA;
    }
  });

  it("accepts an allowed image when its signature matches", () => {
    const result = validateArtifactUpload({
      bytes: bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00),
      declaredMimeType: "image/png",
      fileName: "diagram.png",
    });

    expect(result).toMatchObject({
      isImage: true,
      mimeType: "image/png",
      ok: true,
    });
  });

  it("rejects active SVG content even when the browser declares it as an image", () => {
    const result = validateArtifactUpload({
      bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script /></svg>'),
      declaredMimeType: "image/svg+xml",
      fileName: "unsafe.svg",
    });

    expect(result).toMatchObject({ ok: false, status: 415 });
  });

  it("rejects a declared image when its binary signature does not match", () => {
    const result = validateArtifactUpload({
      bytes: new TextEncoder().encode("not a png"),
      declaredMimeType: "image/png",
      fileName: "spoofed.png",
    });

    expect(result).toMatchObject({ ok: false, status: 415 });
  });

  it("validates JSON contents instead of trusting the extension", () => {
    const valid = validateArtifactUpload({
      bytes: new TextEncoder().encode('{"ok":true}'),
      declaredMimeType: "application/json",
      fileName: "data.json",
    });
    const invalid = validateArtifactUpload({
      bytes: new TextEncoder().encode("{not-json}"),
      declaredMimeType: "application/json",
      fileName: "data.json",
    });

    expect(valid).toMatchObject({ ok: true, mimeType: "application/json" });
    expect(invalid).toMatchObject({ ok: false, status: 415 });
  });

  it("uses a configurable positive per-user storage quota", () => {
    process.env.NODES_USER_STORAGE_QUOTA_BYTES = "123456";
    expect(getSessionArtifactStorageQuotaBytes()).toBe(123456);

    process.env.NODES_USER_STORAGE_QUOTA_BYTES = "invalid";
    expect(getSessionArtifactStorageQuotaBytes()).toBe(100 * 1024 * 1024);
  });
});
