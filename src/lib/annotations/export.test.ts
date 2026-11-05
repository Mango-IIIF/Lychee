import { describe, expect, it } from "vitest";
import { exportStructures, normaliseExportKinds } from "./export";
import { newSection, readStructures, toStructures } from "./structures";

const canvas = "https://example.org/canvas/1";

describe("normaliseExportKinds", () => {
  it("offers both unless the host narrows it", () => {
    expect(normaliseExportKinds(undefined)).toEqual(["annotations", "structures"]);
    expect(normaliseExportKinds(["structures"])).toEqual(["structures"]);
    expect(normaliseExportKinds(["structures", "annotations"])).toEqual(["annotations", "structures"]);
    expect(normaliseExportKinds(["nonsense"])).toEqual(["annotations", "structures"]);
  });
});

describe("exportStructures", () => {
  it("hands over nothing until there is a table of contents", () => {
    expect(exportStructures([])).toEqual({ structures: [], unresolvedIdentities: [], publicationValid: false });
  });

  it("reports the draft ids of every Range, nested ones too", () => {
    const sections = [
      { ...newSection({ label: { en: "Part" } }), id: "https://example.org/range/1", children: [
        { ...newSection({ label: { en: "Chapter" }, pages: [canvas] }), id: "urn:uuid:chapter" },
      ] },
    ];
    const structures = toStructures(sections, ["en"]);
    const result = exportStructures(structures);
    expect(result.structures).toEqual(structures);
    expect(result.unresolvedIdentities).toEqual(["urn:uuid:chapter"]);
    expect(result.publicationValid).toBe(false);
  });

  it("is ready to publish when every id is HTTP(S), locked Ranges included", () => {
    const structures = toStructures(
      readStructures([
        { id: "https://example.org/range/1", type: "Range", label: { en: ["Part"] }, items: [{ id: canvas, type: "Canvas" }] },
        { id: "https://example.org/range/2", type: "Range", behavior: ["no-nav"], items: [{ id: canvas, type: "Canvas" }] },
      ]),
      ["en"],
    );
    expect(exportStructures(structures).publicationValid).toBe(true);
  });
});
