import { afterEach, describe, expect, it } from "vitest";
import {
  getSessionArtifactStorageQuotaBytes,
  validateArtifactUpload,
} from "../lib/artifact-upload-policy";

const ORIGINAL_QUOTA = process.env.NODES_USER_STORAGE_QUOTA_BYTES;

const png = (width: number, height: number) => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  return bytes;
};

const pushUint16Le = (target: number[], value: number) => {
  target.push(value & 0xff, (value >>> 8) & 0xff);
};

const pushUint32Le = (target: number[], value: number) => {
  target.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
};

const buildStoredZip = (entries: Array<{ name: string; value?: string }>) => {
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = [...encoder.encode(entry.name)];
    const value = [...encoder.encode(entry.value ?? "")];

    pushUint32Le(local, 0x04034b50);
    pushUint16Le(local, 20);
    pushUint16Le(local, 0x0800);
    pushUint16Le(local, 0);
    pushUint16Le(local, 0);
    pushUint16Le(local, 0);
    pushUint32Le(local, 0);
    pushUint32Le(local, value.length);
    pushUint32Le(local, value.length);
    pushUint16Le(local, name.length);
    pushUint16Le(local, 0);
    local.push(...name, ...value);

    pushUint32Le(central, 0x02014b50);
    pushUint16Le(central, 20);
    pushUint16Le(central, 20);
    pushUint16Le(central, 0x0800);
    pushUint16Le(central, 0);
    pushUint16Le(central, 0);
    pushUint16Le(central, 0);
    pushUint32Le(central, 0);
    pushUint32Le(central, value.length);
    pushUint32Le(central, value.length);
    pushUint16Le(central, name.length);
    pushUint16Le(central, 0);
    pushUint16Le(central, 0);
    pushUint16Le(central, 0);
    pushUint16Le(central, 0);
    pushUint32Le(central, 0);
    pushUint32Le(central, localOffset);
    central.push(...name);

    localOffset += 30 + name.length + value.length;
  }

  const archive = [...local, ...central];
  pushUint32Le(archive, 0x06054b50);
  pushUint16Le(archive, 0);
  pushUint16Le(archive, 0);
  pushUint16Le(archive, entries.length);
  pushUint16Le(archive, entries.length);
  pushUint32Le(archive, central.length);
  pushUint32Le(archive, local.length);
  pushUint16Le(archive, 0);
  return new Uint8Array(archive);
};

const wordDocument = (extraEntries: Array<{ name: string; value?: string }> = []) =>
  buildStoredZip([
    { name: "[Content_Types].xml", value: "<Types />" },
    { name: "_rels/.rels", value: "<Relationships />" },
    { name: "word/document.xml", value: "<document />" },
    ...extraEntries,
  ]);

describe("artifact upload policy", () => {
  afterEach(() => {
    if (ORIGINAL_QUOTA === undefined) {
      delete process.env.NODES_USER_STORAGE_QUOTA_BYTES;
    } else {
      process.env.NODES_USER_STORAGE_QUOTA_BYTES = ORIGINAL_QUOTA;
    }
  });

  it("accepts a supported image with matching extension, MIME, signature, and dimensions", () => {
    expect(
      validateArtifactUpload({
        bytes: png(800, 600),
        declaredMimeType: "image/png",
        fileName: "diagram.png",
      }),
    ).toMatchObject({
      fileName: "diagram.png",
      isImage: true,
      mimeType: "image/png",
      ok: true,
    });
  });

  it("rejects dangerous or misleading file names even with a safe declared MIME", () => {
    const html = validateArtifactUpload({
      bytes: new TextEncoder().encode("<script>alert(1)</script>"),
      declaredMimeType: "text/plain",
      fileName: "payload.html",
    });
    const path = validateArtifactUpload({
      bytes: new TextEncoder().encode("safe"),
      declaredMimeType: "text/plain",
      fileName: "../notes.txt",
    });
    const bidi = validateArtifactUpload({
      bytes: new TextEncoder().encode("safe"),
      declaredMimeType: "text/plain",
      fileName: "invoice\u202Etxt.exe.txt",
    });

    expect(html).toMatchObject({ ok: false, status: 415 });
    expect(path).toMatchObject({ ok: false, status: 400 });
    expect(bidi).toMatchObject({ ok: false, status: 400 });
  });

  it("requires the declared MIME type to match the canonical extension", () => {
    expect(
      validateArtifactUpload({
        bytes: png(10, 10),
        declaredMimeType: "application/pdf",
        fileName: "diagram.png",
      }),
    ).toMatchObject({ ok: false, status: 415 });
  });

  it("rejects oversized image dimensions before browser rendering", () => {
    expect(
      validateArtifactUpload({
        bytes: png(20_000, 20_000),
        declaredMimeType: "image/png",
        fileName: "huge.png",
      }),
    ).toMatchObject({ ok: false, status: 415 });
  });

  it("rejects active PDF features and accepts a passive complete PDF", () => {
    const safe = validateArtifactUpload({
      bytes: new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF"),
      declaredMimeType: "application/pdf",
      fileName: "report.pdf",
    });
    const active = validateArtifactUpload({
      bytes: new TextEncoder().encode(
        "%PDF-1.7\n1 0 obj << /OpenAction 2 0 R /JavaScript 3 0 R >> endobj\n%%EOF",
      ),
      declaredMimeType: "application/pdf",
      fileName: "active.pdf",
    });

    expect(safe).toMatchObject({ ok: true, mimeType: "application/pdf" });
    expect(active).toMatchObject({ ok: false, status: 415 });
  });

  it("validates the OOXML package instead of trusting ZIP magic", () => {
    const valid = validateArtifactUpload({
      bytes: wordDocument(),
      declaredMimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "notes.docx",
    });
    const wrongPackage = validateArtifactUpload({
      bytes: buildStoredZip([
        { name: "[Content_Types].xml" },
        { name: "_rels/.rels" },
        { name: "xl/workbook.xml" },
      ]),
      declaredMimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "notes.docx",
    });
    const traversal = validateArtifactUpload({
      bytes: wordDocument([{ name: "../outside.xml" }]),
      declaredMimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "notes.docx",
    });

    expect(valid).toMatchObject({ ok: true });
    expect(wrongPackage).toMatchObject({ ok: false, status: 415 });
    expect(traversal).toMatchObject({ ok: false, status: 415 });
  });

  it("validates the complete UTF-8 text and JSON depth", () => {
    const invalidUtf8 = new Uint8Array(70 * 1024);
    invalidUtf8.fill(0x61);
    invalidUtf8[invalidUtf8.length - 1] = 0xff;
    const deeplyNestedJson = `${"[".repeat(101)}0${"]".repeat(101)}`;

    expect(
      validateArtifactUpload({
        bytes: invalidUtf8,
        declaredMimeType: "text/plain",
        fileName: "notes.txt",
      }),
    ).toMatchObject({ ok: false, status: 415 });
    expect(
      validateArtifactUpload({
        bytes: new TextEncoder().encode(deeplyNestedJson),
        declaredMimeType: "application/json",
        fileName: "deep.json",
      }),
    ).toMatchObject({ ok: false, status: 415 });
  });

  it("uses a configurable positive per-user storage quota", () => {
    process.env.NODES_USER_STORAGE_QUOTA_BYTES = "123456";
    expect(getSessionArtifactStorageQuotaBytes()).toBe(123456);

    process.env.NODES_USER_STORAGE_QUOTA_BYTES = "invalid";
    expect(getSessionArtifactStorageQuotaBytes()).toBe(100 * 1024 * 1024);
  });
});
