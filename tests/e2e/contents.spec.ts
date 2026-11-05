import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

/*
 * Tables of contents (IIIF Ranges) on both stages: the NLW register's pages
 * (recipe 0024's shape) and the Women's Archive Wales recording, which comes
 * with chapters of its own (recipe 0026's shape). Saving hands the host the
 * whole table of contents with `structuresSave`.
 */

const AUDIO = "manifests/iiif-pcw-550555/manifest.json";

type Range = { id: string; type: string; label: Record<string, string[]>; items: Range[]; [key: string]: unknown };
type Editor = HTMLElement & { getStructures(): Range[]; setStructures(structures: unknown[]): void };

const structures = (page: Page) =>
  page.evaluate(() => (document.querySelector("mango-annotation-editor") as Editor).getStructures());

/** Collects the events the editor dispatches. */
const recordEvents = (page: Page) =>
  page.evaluate(() => {
    const events: { type: string; detail: unknown }[] = [];
    (window as unknown as { events: typeof events }).events = events;
    const editor = document.querySelector("mango-annotation-editor")!;
    for (const type of ["structuresSave", "annotationCreate", "annotationUpdate", "annotationDelete"]) {
      editor.addEventListener(type, (event) => events.push({ type, detail: (event as CustomEvent).detail }));
    }
  });

const events = (page: Page) =>
  page.evaluate(() => (window as unknown as { events: { type: string; detail: { structures: Range[] } }[] }).events);

const contents = (page: Page) => page.getByRole("region", { name: "Contents" });

test.describe("contents of a book", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/annotation-editor.html");
    await expect(page.getByRole("group", { name: "What is it about?" })).toBeVisible();
    await recordEvents(page);
    await page.getByRole("tab", { name: "Contents" }).click();
  });

  test("groups pages into nested sections and saves them as Ranges", async ({ page }) => {
    const panel = contents(page);
    await panel.getByRole("button", { name: "Add section" }).click();
    await panel.getByLabel("Section title").first().fill("Register");

    // A subsection takes over its parent's pages; the parent becomes a group.
    await panel.getByRole("button", { name: "Add a section inside" }).first().click();
    await panel.getByLabel("Section title").nth(1).fill("First entries");
    await panel.getByRole("combobox", { name: "To", exact: true }).first().selectOption({ index: 2 });

    const [range] = await structures(page);
    expect(range).toMatchObject({
      type: "Range",
      label: { en: ["Register"] },
      items: [{ type: "Range", label: { en: ["First entries"] } }],
    });
    const [child] = range.items;
    expect(child.items).toHaveLength(3);
    expect(child.items.every((item) => item.type === "Canvas")).toBe(true);

    await panel.getByRole("button", { name: "Save contents" }).click();
    await expect(panel.getByRole("status")).toHaveText("Contents saved.");
    const [saved] = await events(page);
    expect(saved.type).toBe("structuresSave");
    expect(saved.detail.structures).toEqual([range]);

    // Nothing travels as an annotation, and a later save sends the whole table again.
    await panel.getByLabel("Section title").first().fill("Constabulary register");
    await panel.getByRole("button", { name: "Save contents" }).click();
    const sent = await events(page);
    expect(sent.map((event) => event.type)).toEqual(["structuresSave", "structuresSave"]);
    expect(sent[1].detail.structures[0].label).toEqual({ en: ["Constabulary register"] });
  });

  test("downloads annotations, contents or both once contents are saved", async ({ page }) => {
    const header = page.locator(".viewer__top-row");
    // Nothing saved yet: one button, as before.
    await expect(header.getByRole("button", { name: "Download annotations (0)" })).toBeDisabled();

    const panel = contents(page);
    await panel.getByRole("button", { name: "Add section" }).click();
    await panel.getByLabel("Section title").first().fill("Register");
    await panel.getByRole("button", { name: "Save contents" }).click();

    await page.evaluate(() => {
      const detail: Record<string, unknown> = {};
      (window as unknown as { exported: typeof detail }).exported = detail;
      const editor = document.querySelector("mango-annotation-editor")!;
      for (const type of ["exportAnnotationPage", "exportStructures"]) {
        editor.addEventListener(type, (event) => (detail[type] = (event as CustomEvent).detail));
      }
    });
    const exported = () =>
      page.evaluate(() => (window as unknown as { exported: Record<string, Record<string, unknown>> }).exported);

    const choose = async (item: string, file: string) => {
      await page.evaluate(() => {
        const detail = (window as unknown as { exported: Record<string, unknown> }).exported;
        for (const key of Object.keys(detail)) delete detail[key];
      });
      await header.getByRole("button", { name: "Download", exact: true }).click();
      const download = page.waitForEvent("download");
      await header.getByRole("menuitem", { name: item, exact: true }).click();
      const done = await download;
      expect(done.suggestedFilename()).toBe(file);
      return JSON.parse(await readFile((await done.path())!, "utf8"));
    };

    await header.getByRole("button", { name: "Download", exact: true }).click();
    await expect(header.getByRole("menuitem", { name: "Annotations (0)" })).toBeDisabled();
    await header.getByRole("button", { name: "Download", exact: true }).click();

    const contentsFile = await choose("Contents", "contents-draft.json");
    expect(contentsFile).toMatchObject({ structures: [{ type: "Range", label: { en: ["Register"] } }] });
    const onlyContents = await exported();
    expect(Object.keys(onlyContents)).toEqual(["exportStructures"]);
    expect(onlyContents.exportStructures).toMatchObject({
      structures: [{ type: "Range", label: { en: ["Register"] } }],
      publicationValid: false,
    });

    const bothFile = await choose("Annotations and contents", "annotations-and-contents-draft.json");
    expect(bothFile.annotations).toMatchObject({ type: "AnnotationPage", items: [] });
    expect(bothFile.structures).toEqual(contentsFile.structures);
    const both = await exported();
    expect(Object.keys(both).sort()).toEqual(["exportAnnotationPage", "exportStructures"]);
  });

  test("will not save a section without a title", async ({ page }) => {
    const panel = contents(page);
    await panel.getByRole("button", { name: "Add section" }).click();
    await expect(panel.getByText("Give it a title.")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Save contents" })).toBeDisabled();
  });

  test("opens the table of contents the host hands it, as saved", async ({ page }) => {
    await page.evaluate(() =>
      (document.querySelector("mango-annotation-editor") as Editor).setStructures([
        {
          id: "https://example.org/range/1",
          type: "Range",
          label: { en: ["From the host"] },
          items: [{ id: "https://example.org/elsewhere", type: "Canvas" }],
        },
      ]),
    );
    const panel = contents(page);
    await expect(panel.getByLabel("Section title")).toHaveValue("From the host");
    // A page the item does not have is flagged, and nothing is unsaved.
    await expect(panel.getByText("It points to a page or recording that is not in this item.")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Save contents" })).toBeDisabled();
  });
});

test.describe("contents of a recording", () => {
  test.beforeEach(async ({ page }) => {
    const params = new URLSearchParams({ manifest: new URL(AUDIO, "http://127.0.0.1:4173/").href, type: "audio" });
    await page.goto(`/annotation-editor.html?${params}`);
    await expect(page.getByLabel("Start (seconds)")).toBeVisible();
    await recordEvents(page);
    await page.getByRole("tab", { name: "Contents" }).click();
  });

  const outline = (page: Page) => contents(page).getByRole("navigation", { name: "Chapters" });

  test("opens the recording's own chapters and keeps what it does not edit", async ({ page }) => {
    // The chapters are in the sidebar, so the player has no Chapters tab of its own.
    await expect(page.getByRole("tab", { name: "Transcript" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Chapters" })).toHaveCount(0);

    const before = await structures(page);
    expect(before[0].items).toHaveLength(14);

    await outline(page).getByRole("button", { name: /Learning hosiery production/ }).click();
    const title = contents(page).getByLabel("Chapter title");
    await expect(title).toHaveValue("Learning hosiery production");
    await title.fill("Learning the trade");

    await contents(page).getByRole("button", { name: "Save contents" }).click();
    const [saved] = await events(page);
    expect(saved.type).toBe("structuresSave");
    const [group] = saved.detail.structures;
    // Same Ranges, same ids, thumbnails kept; only the title changed.
    expect(group.items.map((range) => range.id)).toEqual(before[0].items.map((range) => range.id));
    expect(group.items[1]).toEqual({ ...before[0].items[1], label: { en: ["Learning the trade"] } });
  });

  test("types the player's hotkey letters into fields, rather than into the player", async ({ page }) => {
    await outline(page).getByRole("button", { name: /Background and joining Corgi/ }).click();
    const title = contents(page).getByLabel("Chapter title");
    await title.fill("");
    // f, k, m and space are RAMP's fullscreen, play and mute keys.
    await title.pressSequentially("Fifty kilometres of film");
    await expect(title).toHaveValue("Fifty kilometres of film");

    await page.getByRole("tab", { name: "Annotate" }).click();
    await page.getByRole("button", { name: "Transcribe" }).click();
    const field = page.getByPlaceholder("Type it exactly as you hear or see it");
    await field.pressSequentially("my father fixed it");
    await expect(field).toHaveValue("my father fixed it");
  });

  test("writes chapters as time fragments, and flags a gap between them", async ({ page }) => {
    const panel = contents(page);
    await outline(page).getByRole("button", { name: /Background and joining Corgi/ }).click();
    const end = panel.getByLabel("End (seconds)");
    await end.fill("150");
    await end.blur();
    await expect(panel.getByRole("button", { name: /Learning hosiery production/ })).toBeVisible();
    // The next chapter still starts at 190: a gap, shown on that chapter.
    await outline(page).getByRole("button", { name: /Learning hosiery production/ }).click();
    await expect(panel.getByText("There is a gap before this section: it plays as silence.")).toBeVisible();

    const fragments = (await structures(page))[0].items.slice(0, 2).map((range) => range.items[0].id.replace(/^.*#/, ""));
    expect(fragments).toEqual(["t=0,150", "t=190,422"]);

    // Deleting a chapter takes it out of the table.
    await panel.getByRole("button", { name: "Delete chapter" }).click();
    expect((await structures(page))[0].items).toHaveLength(13);
    await expect(panel.getByLabel("Chapter title")).toHaveCount(0);
  });
});
