import { describe, expect, it } from "vitest";
import {
  getSessionArtifactMaxRequestBytes,
  getSingleArtifactUploadFile,
  validateArtifactUploadRequestHeaders,
} from "../lib/server/artifact-upload-request";

describe("artifact upload request admission", () => {
  it("accepts a bounded multipart request before body parsing", () => {
    expect(
      validateArtifactUploadRequestHeaders(
        new Headers({
          "content-length": "1024",
          "content-type": "multipart/form-data; boundary=----nodes-boundary",
        }),
      ),
    ).toMatchObject({ ok: true, contentLength: 1024 });
  });

  it("rejects unsupported content types and missing lengths", () => {
    expect(
      validateArtifactUploadRequestHeaders(
        new Headers({
          "content-length": "10",
          "content-type": "application/json",
        }),
      ),
    ).toMatchObject({ ok: false, status: 415 });

    expect(
      validateArtifactUploadRequestHeaders(
        new Headers({
          "content-type": "multipart/form-data; boundary=nodes",
        }),
      ),
    ).toMatchObject({ ok: false, status: 411 });
  });

  it("rejects oversized bodies and malformed boundaries without parsing them", () => {
    expect(
      validateArtifactUploadRequestHeaders(
        new Headers({
          "content-length": String(getSessionArtifactMaxRequestBytes() + 1),
          "content-type": "multipart/form-data; boundary=nodes",
        }),
      ),
    ).toMatchObject({ ok: false, status: 413 });

    expect(
      validateArtifactUploadRequestHeaders(
        new Headers({
          "content-length": "100",
          "content-type": "multipart/form-data; boundary=unsafe boundary",
        }),
      ),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("accepts exactly one file field and rejects ambiguous multipart forms", () => {
    const oneFile = new FormData();
    const file = new File(["safe"], "notes.txt", { type: "text/plain" });
    oneFile.set("file", file);
    expect(getSingleArtifactUploadFile(oneFile)).toBe(file);

    const extraField = new FormData();
    extraField.set("file", file);
    extraField.set("title", "unexpected");
    expect(getSingleArtifactUploadFile(extraField)).toBeNull();

    const wrongField = new FormData();
    wrongField.set("attachment", file);
    expect(getSingleArtifactUploadFile(wrongField)).toBeNull();
  });
});
