import { describe, expect, it } from "vitest";
import {
  addChapterAt,
  addSection,
  indentSection,
  moveSection,
  newSection,
  outdentSection,
  pageSpan,
  readStructures,
  sectionPath,
  sectionProblems,
  sortByTime,
  splitSection,
  toStructures,
  type Section,
} from "./structures";

const book = "https://iiif.io/api/cookbook/recipe/0024-book-4-toc";
const page = (n: number) => `${book}/canvas/p${n}`;
const pages = [1, 2, 3, 4, 5, 6].map(page);

const opera = "https://iiif.io/api/cookbook/recipe/0026-toc-opera";
const recording = `${opera}/canvas/1`;

const section = (id: string, init: Partial<Section>): Section => ({ ...newSection(init), id });

describe("toStructures", () => {
  it("writes a book's table of contents as recipe 0024 does", () => {
    const sections = [
      section(`${book}/range/r0`, {
        label: { en: "Table of Contents" },
        children: [
          section(`${book}/range/r1`, { label: { gez: "Tabiba Tabiban [ጠቢበ ጠቢባን]" }, pages: [page(1), page(2)] }),
          section(`${book}/range/r2`, {
            label: { gez: "Arede'et [አርድዕት]" },
            children: [
              section(`${book}/range/r2/1`, { label: { en: "Monday" }, pages: [page(3), page(4)] }),
              section(`${book}/range/r2/2`, { label: { en: "Tuesday" }, pages: [page(5), page(6)] }),
            ],
          }),
        ],
      }),
    ];
    expect(toStructures(sections, ["en"])).toEqual([
      {
        id: `${book}/range/r0`,
        type: "Range",
        label: { en: ["Table of Contents"] },
        items: [
          {
            id: `${book}/range/r1`,
            type: "Range",
            label: { gez: ["Tabiba Tabiban [ጠቢበ ጠቢባን]"] },
            items: [
              { id: page(1), type: "Canvas" },
              { id: page(2), type: "Canvas" },
            ],
          },
          {
            id: `${book}/range/r2`,
            type: "Range",
            label: { gez: ["Arede'et [አርድዕት]"] },
            items: [
              {
                id: `${book}/range/r2/1`,
                type: "Range",
                label: { en: ["Monday"] },
                items: [
                  { id: page(3), type: "Canvas" },
                  { id: page(4), type: "Canvas" },
                ],
              },
              {
                id: `${book}/range/r2/2`,
                type: "Range",
                label: { en: ["Tuesday"] },
                items: [
                  { id: page(5), type: "Canvas" },
                  { id: page(6), type: "Canvas" },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("writes a recording's chapters as recipe 0026 does, the last running to the end", () => {
    const sections = [
      section(`${opera}/range/2`, {
        label: { it: "Atto Primo" },
        children: [
          section(`${opera}/range/3`, {
            label: { it: "Preludio e Coro d'introduzione – Bel conforto al mietitore" },
            time: { canvasId: recording, start: 0, end: 302.05 },
          }),
          section(`${opera}/range/4`, {
            label: { en: "Remainder of Atto Primo" },
            time: { canvasId: recording, start: 302.05, end: 3971.24 },
          }),
        ],
      }),
      section(`${opera}/range/5`, {
        label: { it: "Atto Secondo" },
        time: { canvasId: recording, start: 3971.24, end: null },
      }),
    ];
    const [first, second] = toStructures(sections, ["it"]);
    expect(first.items).toEqual([
      {
        id: `${opera}/range/3`,
        type: "Range",
        label: { it: ["Preludio e Coro d'introduzione – Bel conforto al mietitore"] },
        items: [{ id: `${recording}#t=0,302.05`, type: "Canvas" }],
      },
      {
        id: `${opera}/range/4`,
        type: "Range",
        label: { en: ["Remainder of Atto Primo"] },
        items: [{ id: `${recording}#t=302.05,3971.24`, type: "Canvas" }],
      },
    ]);
    expect(second.items).toEqual([{ id: `${recording}#t=3971.24`, type: "Canvas" }]);
  });

  it("writes titles in the authoring languages' order and leaves out empty ones", () => {
    const [range] = toStructures([section("r", { label: { en: "Contents", cy: "Cynnwys", fr: " " } })], ["cy", "en"]);
    expect(Object.keys(range.label)).toEqual(["cy", "en"]);
  });
});

describe("readStructures", () => {
  const roundTrip = (structures: unknown[], languages = ["en"]) => toStructures(readStructures(structures), languages);

  it("reads both recipes back exactly as they are written", () => {
    const sections = [
      section("a", { label: { en: "Act one" }, children: [section("b", { label: { en: "Prelude" }, time: { canvasId: recording, start: 0, end: 30 } })] }),
      section("c", { label: { en: "Act two" }, time: { canvasId: recording, start: 30, end: null } }),
      section("d", { label: { en: "Plates" }, pages: [page(2), page(3)] }),
    ];
    const structures = toStructures(sections, ["en"]);
    expect(readStructures(structures)).toEqual(sections);
    expect(roundTrip(structures)).toEqual(structures);
  });

  it("keeps the properties it does not edit, such as a chapter's thumbnail", () => {
    const thumbnail = [{ id: "https://example.org/cover.jpg", type: "Image", format: "image/jpeg" }];
    const range = {
      id: "https://example.org/range/1",
      type: "Range",
      label: { en: ["Childhood"] },
      thumbnail,
      items: [{ id: `${recording}#t=0,190`, type: "Canvas" }],
    };
    const [chapter] = readStructures([range]);
    expect(chapter.extra).toEqual({ thumbnail });
    expect(chapter.locked).toBeUndefined();
    expect(roundTrip([range])).toEqual([range]);
  });

  it("keeps a Range it cannot edit exactly as it came, and can still edit the rest", () => {
    const region = {
      id: "https://example.org/range/region",
      type: "Range",
      label: { en: ["A detail"] },
      items: [{ type: "SpecificResource", source: page(1), selector: { type: "FragmentSelector", value: "xywh=0,0,10,10" } }],
    };
    const hidden = { id: "https://example.org/range/seq", type: "Range", behavior: ["sequence"], items: [{ id: page(1), type: "Canvas" }] };
    const parent = {
      id: "https://example.org/range/parent",
      type: "Range",
      label: { en: ["Part"] },
      items: [region, { id: "https://example.org/range/ok", type: "Range", label: { en: ["Fine"] }, items: [{ id: page(2), type: "Canvas" }] }],
    };
    const [part, sequence] = readStructures([parent, hidden]);
    expect(part.locked).toBeUndefined();
    expect(part.children.map((c) => Boolean(c.locked))).toEqual([true, false]);
    expect(part.children[0].label).toEqual({ en: "A detail" });
    expect(sequence.locked).toBe(hidden);
    expect(roundTrip([parent, hidden])).toEqual([parent, hidden]);
    // Nothing can be added inside a locked one, or indented into it.
    expect(addSection([part], newSection(), part.children[0].id)[0].children[0].children).toEqual([]);
    expect(indentSection(part.children, part.children[1].id)).toHaveLength(2);
  });

  it("locks ranges that mix pages and subsections, or name more than one span", () => {
    const mixed = { id: "m", type: "Range", label: { en: ["M"] }, items: [{ id: page(1), type: "Canvas" }, { id: "x", type: "Range", items: [] }] };
    const twoSpans = { id: "t", type: "Range", items: [{ id: `${recording}#t=0,5`, type: "Canvas" }, { id: `${recording}#t=9,12`, type: "Canvas" }] };
    expect(readStructures([mixed, twoSpans]).map((s) => Boolean(s.locked))).toEqual([true, true]);
  });

  it("leaves locked ones out of the checks", () => {
    const [locked] = readStructures([{ id: "x", type: "Range", items: [{ id: page(9), type: "Canvas", label: "Extra" }] }]);
    expect(sectionProblems([locked], { canvasIds: pages })).toEqual([]);
  });

  it("reads nothing from a manifest without structures", () => {
    expect(readStructures(undefined)).toEqual([]);
  });
});

describe("editing", () => {
  const tree = () => [section("a", { label: { en: "A" } }), section("b", { label: { en: "B" } }), section("c", { label: { en: "C" } })];

  it("indents under the section before, and outdents to just after the parent", () => {
    const indented = indentSection(tree(), "b");
    expect(indented.map((s) => s.id)).toEqual(["a", "c"]);
    expect(indented[0].children.map((s) => s.id)).toEqual(["b"]);
    expect(outdentSection(indented, "b").map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("hands a section's own span to its first subsection, so parents only group", () => {
    const act = section("act", { label: { en: "Act one" }, time: { canvasId: recording, start: 0, end: 60 } });
    const [group] = addSection([act], section("scene", { label: { en: "Scene one" } }), "act");
    expect(group.time).toBeUndefined();
    expect(group.children.map((c) => [c.id, c.time])).toEqual([["scene", { canvasId: recording, start: 0, end: 60 }]]);
    const [indented] = indentSection([section("p", { label: { en: "Part" }, pages: [page(1)] }), section("q", { label: { en: "Q" }, pages: [page(2)] })], "q");
    expect(indented.pages).toEqual([]);
    expect(indented.children.map((c) => c.pages)).toEqual([[page(1)], [page(2)]]);
  });

  it("moves among siblings only", () => {
    expect(moveSection(tree(), "a", -1).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(moveSection(tree(), "a", 1).map((s) => s.id)).toEqual(["b", "a", "c"]);
  });

  it("splits a span at a moment inside it", () => {
    const sections = [section("a", { label: { en: "A" }, time: { canvasId: recording, start: 10, end: 50 } })];
    const [first, second] = splitSection(sections, "a", 20);
    expect(first.time).toEqual({ canvasId: recording, start: 10, end: 20 });
    expect(second.time).toEqual({ canvasId: recording, start: 20, end: 50 });
    expect(second.label).toEqual({});
    expect(splitSection(sections, "a", 60)).toHaveLength(1);
  });

  it("spans pages in manifest order, whichever end comes first", () => {
    expect(pageSpan(pages, page(4), page(2))).toEqual([page(2), page(3), page(4)]);
  });

  it("finds the sections around one, outermost first", () => {
    const tree = [section("a", { children: [section("b", { children: [section("c", {})] })] })];
    expect(sectionPath(tree, "c").map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(sectionPath(tree, "z")).toEqual([]);
  });
});

describe("chapters", () => {
  const other = `${opera}/canvas/2`;
  const canvasIds = [recording, other];
  const span = (id: string, start: number, end: number | null, canvasId = recording) =>
    section(id, { label: { en: id }, time: { canvasId, start, end } });

  it("keeps chapters in the order they play, groups by their first, new ones last", () => {
    const sorted = sortByTime(
      [span("late", 50, null), section("new", {}), span("next", 0, 10, other), section("group", { children: [span("b", 20, 30), span("a", 10, 20)] })],
      canvasIds,
    );
    expect(sorted.map((s) => s.id)).toEqual(["group", "late", "next", "new"]);
    expect(sorted[0].children.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("splits the chapter playing when one is added inside it", () => {
    const { sections, id } = addChapterAt([span("a", 0, 60)], recording, 25, canvasIds);
    expect(sections.map((s) => [s.id === id ? "new" : s.id, s.time?.start, s.time?.end])).toEqual([
      ["a", 0, 25],
      ["new", 25, 60],
    ]);
  });

  it("runs a new chapter up to the next one, or to the end", () => {
    const before = addChapterAt([span("b", 40, null)], recording, 10, canvasIds);
    expect(before.sections.map((s) => [s.time?.start, s.time?.end])).toEqual([
      [10, 40],
      [40, null],
    ]);
    const after = addChapterAt([span("a", 0, 10)], recording, 20, canvasIds);
    expect(after.sections.at(-1)?.time).toEqual({ canvasId: recording, start: 20, end: null });
  });

  it("opens the chapter that starts at the playhead rather than adding one", () => {
    const { sections, id } = addChapterAt([span("a", 0, 10), span("b", 10, null)], recording, 10, canvasIds);
    expect(id).toBe("b");
    expect(sections).toHaveLength(2);
  });
});

describe("sectionProblems", () => {
  const check = (sections: Section[]) =>
    sectionProblems(sections, { canvasIds: [...pages, recording], durations: { [recording]: 100 } }).map(
      (p) => `${p.sectionId}:${p.kind}`,
    );

  it("needs a title and something to point at", () => {
    expect(check([section("a", {})])).toEqual(["a:label", "a:empty"]);
  });

  it("flags pages that are not in the manifest and times out of range", () => {
    expect(check([section("a", { label: { en: "A" }, pages: ["elsewhere"] })])).toEqual(["a:page"]);
    expect(check([section("a", { label: { en: "A" }, time: { canvasId: recording, start: 5, end: 200 } })])).toEqual(["a:time.end"]);
  });

  it("warns about gaps and overlaps between spans of one recording", () => {
    const span = (id: string, start: number, end: number | null) =>
      section(id, { label: { en: id }, time: { canvasId: recording, start, end } });
    expect(check([span("a", 0, 10), span("b", 10, 20), span("c", 25, 30), span("d", 29, null)])).toEqual([
      "c:gap",
      "d:overlap",
    ]);
  });
});
