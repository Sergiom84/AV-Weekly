import { describe, expect, it } from "vitest";
import {
  MAX_INFORMATICA_UPLOAD_SIZE_BYTES,
  exceedsInformaticaUploadLimit,
} from "./upload-limits.js";

describe("Informatica upload limits", () => {
  it("accepts the aggregate boundary", () => {
    expect(exceedsInformaticaUploadLimit([{ size: MAX_INFORMATICA_UPLOAD_SIZE_BYTES }])).toBe(false);
  });

  it("rejects a group above the aggregate boundary", () => {
    expect(
      exceedsInformaticaUploadLimit([
        { size: 21 * 1024 * 1024 },
        { size: 20 * 1024 * 1024 },
      ])
    ).toBe(true);
  });
});
