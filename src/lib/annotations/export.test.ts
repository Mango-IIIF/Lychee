import { describe, expect, it } from "vitest";
import type { Annotation } from "@mango-iiif/annotation";
import { buildChangeset, exportStructures, normaliseExportKinds } from "./export";
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

describe("buildChangeset", () => {
  const make = (id: string): Annotation => ({
    "@context": "http://www.w3.org/ns/anno.jsonld",
    id,
    type: "Annotation",
    motivation: "commenting",
    target: canvas,
  });

  it("separates newly created annotations from modified existing ones and deduplicates deletions", () => {
    const result = buildChangeset({
      manifestId: "https://example.org/manifest/1",
      userAnnotations: [make("urn:uuid:new-1"), make("https://example.org/anno/42")],
      modifiedExistingIds: ["https://example.org/anno/42"],
      deletedExistingIds: ["https://example.org/anno/9", "https://example.org/anno/9"],
    });

    expect(result.manifestId).toBe("https://example.org/manifest/1");
    expect(result.created.map((a) => a.id)).toEqual(["urn:uuid:new-1"]);
    expect(result.updated.map((a) => a.id)).toEqual(["https://example.org/anno/42"]);
    expect(result.deleted).toEqual(["https://example.org/anno/9"]);
    expect(result.created[0]).not.toHaveProperty("@context");
    expect(result.structuresChanged).toBe(false);
    expect(result.structures).toBeUndefined();
    expect(result.hasChanges).toBe(true);
  });

  it("reports hasChanges=false when nothing changed and includes structures only when changed", () => {
    const empty = buildChangeset({
      manifestId: "https://example.org/manifest/1",
      userAnnotations: [],
      modifiedExistingIds: [],
      deletedExistingIds: [],
      structures: [],
      structuresChanged: false,
    });
    expect(empty.hasChanges).toBe(false);
    expect(empty.structures).toBeUndefined();

    const structures = toStructures([newSection({ label: { en: "Intro" }, pages: [canvas] })], ["en"]);
    const withToc = buildChangeset({
      manifestId: "https://example.org/manifest/1",
      userAnnotations: [],
      modifiedExistingIds: [],
      deletedExistingIds: [],
      structures,
      structuresChanged: true,
    });
    expect(withToc.hasChanges).toBe(true);
    expect(withToc.structuresChanged).toBe(true);
    expect(withToc.structures).toEqual(structures);
  });
});
