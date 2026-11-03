import { describe, expect, it } from "vitest";
import { loadExistingAnnotations } from "./load";

const canvas = "https://example.org/canvas/audio";

const cue = (n: number) => ({
  id: `https://example.org/transcript/${n}`,
  type: "Annotation",
  motivation: "supplementing",
  body: { type: "TextualBody", value: `Cue ${n}`, format: "text/plain" },
  target: `${canvas}#t=${n},${n + 1}`,
});

const manifest = (pages: unknown[]) => ({
  items: [{ id: canvas, type: "Canvas", annotations: pages }],
});

describe("loadExistingAnnotations", () => {
  it("leaves out WebVTT and SRT transcript files", async () => {
    const annotations = await loadExistingAnnotations(
      manifest([
        {
          type: "AnnotationPage",
          items: [
            {
              id: "a",
              type: "Annotation",
              motivation: "supplementing",
              body: {
                id: "https://example.org/t.vtt",
                type: "Text",
                format: "text/vtt",
              },
              target: canvas,
            },
            {
              id: "b",
              type: "Annotation",
              motivation: "supplementing",
              body: { id: "https://example.org/t.srt", type: "Text" },
              target: canvas,
            },
            {
              id: "c",
              type: "Annotation",
              motivation: "commenting",
              body: { type: "TextualBody", value: "Kept" },
              target: canvas,
            },
          ],
        },
      ]),
    );
    expect(annotations.map((a) => a.id)).toEqual(["c"]);
  });

  it("leaves out pages of timed transcript cues", async () => {
    const annotations = await loadExistingAnnotations(
      manifest([
        { type: "AnnotationPage", items: [cue(0), cue(1), cue(2)] },
        {
          type: "AnnotationPage",
          items: [cue(3), { ...cue(4), id: "note", motivation: "commenting" }],
        },
      ]),
    );
    expect(annotations.map((a) => a.id)).toEqual([
      "https://example.org/transcript/3",
      "note",
    ]);
  });
});
