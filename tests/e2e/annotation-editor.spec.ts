import { expect, test, type Page } from "@playwright/test";

/*
 * The editor end to end, on the demo's test manifests: the NLW register
 * (image, live IIIF image service) and the Women's Archive Wales recording
 * (audio, fixture manifest with transcript and chapters). Wikidata is stubbed.
 */

const AUDIO = "manifests/iiif-pcw-550555/manifest.json";

const trackErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      // A third-party tile or media request failing is not an application error.
      !message.text().startsWith("Failed to load resource:") &&
      !message.text().includes("ERR_BLOCKED_BY_RESPONSE")
    ) {
      errors.push(message.text());
    }
  });
  return errors;
};

const userAnnotations = (page: Page) =>
  page.evaluate(() =>
    (
      document.querySelector("mango-annotation-editor") as HTMLElement & {
        getUserAnnotations(): Record<string, unknown>[];
      }
    ).getUserAnnotations(),
  );

/* Annotorious draws in click mode: click a corner, move, click the opposite corner. */
const drawBox = async (page: Page) => {
  await page.getByRole("button", { name: "Draw a box" }).click();
  const stage = page.locator(".a9s-osd-drawinglayer");
  await expect(stage).toHaveClass(/drawing/);
  const area = (await stage.boundingBox())!;
  await page.mouse.click(area.x + area.width * 0.35, area.y + area.height * 0.3);
  await page.mouse.move(area.x + area.width * 0.6, area.y + area.height * 0.55, { steps: 6 });
  await page.mouse.click(area.x + area.width * 0.6, area.y + area.height * 0.55);
};

test.describe("image", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/annotation-editor.html");
    await expect(page.getByRole("group", { name: "What is it about?" })).toBeVisible();
    await expect(page.locator(".a9s-osd-drawinglayer")).toBeAttached({ timeout: 30_000 });
    // Draw only once OpenSeadragon has opened the image: before that there are no image coordinates.
    await page.waitForFunction(
      () =>
        ((
          document.querySelector("mango-annotation-editor") as HTMLElement & {
            getContentSize(): { width: number } | null;
          }
        ).getContentSize()?.width ?? 0) > 0,
      undefined,
      { timeout: 30_000 },
    );
  });

  test("draws an area and writes a bilingual note about it", async ({ page }) => {
    const errors = trackErrors(page);
    await drawBox(page);
    await expect(page.getByText(/Area selected, \d+ × \d+ px/)).toBeVisible();

    await page.getByRole("button", { name: "Add a note" }).click();
    await page.getByPlaceholder("A short title").fill("Station label");
    await page.getByPlaceholder("What does this show or tell us?").fill("Names the station.");
    await page.locator(".anno-languages button").nth(1).click();
    await page.getByPlaceholder("What does this show or tell us?").fill("Yn enwi'r orsaf.");
    // The other language now shows it has text.
    await expect(page.locator(".anno-languages button").first().locator("svg")).toBeVisible();
    await page.getByRole("button", { name: "Save annotation" }).click();

    await expect(page.getByRole("tab", { name: "Your annotations (1)" })).toBeVisible();
    const [saved] = await userAnnotations(page);
    expect(saved).toMatchObject({
      motivation: "commenting",
      label: { en: ["Station label"] },
      // The same text in two languages is a Choice (IIIF Cookbook recipe 0346).
      body: {
        type: "Choice",
        items: [
          { type: "TextualBody", value: "Names the station.", language: "en" },
          { type: "TextualBody", value: "Yn enwi'r orsaf.", language: "cy" },
        ],
      },
      target: {
        type: "SpecificResource",
        source: {
          type: "Canvas",
          partOf: { id: "https://iiif.llyfrgell.cymru/manifests/2.0/4389767/manifest.json" },
        },
        selector: { type: "FragmentSelector", value: expect.stringMatching(/^xywh=pixel:\d+,\d+,\d+,\d+$/) },
      },
    });
    expect(errors).toEqual([]);
  });

  test("draws a second shape straight after the first", async ({ page }) => {
    await page.getByRole("button", { name: "Rectangle" }).click();
    const area = (await page.locator(".a9s-osd-drawinglayer").boundingBox())!;
    const box = async (x: number, y: number, w: number, h: number) => {
      await page.mouse.click(area.x + area.width * x, area.y + area.height * y);
      await page.mouse.move(area.x + area.width * (x + w), area.y + area.height * (y + h), { steps: 6 });
      await page.mouse.click(area.x + area.width * (x + w), area.y + area.height * (y + h));
    };
    await box(0.2, 0.2, 0.1, 0.1);
    const first = await page.getByText(/Area selected, \d+ × \d+ px/).textContent();
    // The first shape is still selected; one press on empty image must start the next.
    await box(0.5, 0.5, 0.3, 0.3);
    await expect(page.getByText(/Area selected, \d+ × \d+ px/)).not.toHaveText(first!);
  });

  test("tags the whole image, edits and deletes it", async ({ page }) => {
    await page.getByRole("button", { name: "This image" }).click();
    await page.getByRole("button", { name: "Tag" }).click();
    await page.getByPlaceholder("Separate with commas").fill("police, register");
    await page.getByRole("button", { name: "Save annotation" }).click();

    // One tagging annotation per keyword (IIIF Cookbook recipe 0021).
    const cards = page.locator(".annotation-list__card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("Whole image · Tag");
    expect(await userAnnotations(page)).toHaveLength(2);

    const police = cards.filter({ hasText: "police" });
    await police.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByPlaceholder("Separate with commas")).toHaveValue("police");
    await page.getByPlaceholder("Separate with commas").fill("constable");
    await page.getByRole("button", { name: "Update annotation" }).click();
    const updated = (await userAnnotations(page)).find(
      (annotation) => (annotation.body as { value?: string }).value === "constable",
    );
    expect(updated).toMatchObject({ motivation: "tagging", body: { value: "constable" } });
    expect(updated!.modified).toBeTruthy();

    await cards.filter({ hasText: "constable" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("tab", { name: "Your annotations (1)" })).toBeVisible();
  });

  test("offers an area or the whole image, not the whole item", async ({ page }) => {
    const scope = page.getByRole("group", { name: "What is it about?" });
    await expect(scope.getByRole("button")).toHaveText(["An area", "This image"]);
  });

  test("asks for a shape before saving an area annotation", async ({ page }) => {
    await page.getByRole("button", { name: "Highlight" }).click();
    await page.getByRole("button", { name: "Save annotation" }).click();
    await expect(page.getByRole("alert")).toHaveText(/Draw or select a shape/);
  });

  test("identifies with Wikidata", async ({ page }) => {
    await page.route("https://www.wikidata.org/w/api.php**", (route) =>
      route.fulfill({
        json: { search: [{ id: "Q213154", label: "Aberystwyth", description: "town in Ceredigion, Wales" }] },
      }),
    );
    await page.getByRole("button", { name: "This image" }).click();
    await page.getByRole("button", { name: "Identify" }).click();
    await page.getByRole("searchbox", { name: "Search Wikidata" }).fill("Aberystwyth");
    await page.getByRole("button", { name: /Aberystwyth Q213154/ }).click();
    await page.getByRole("button", { name: "Save annotation" }).click();

    const [saved] = await userAnnotations(page);
    expect(saved).toMatchObject({
      motivation: "identifying",
      body: { type: "SpecificResource", source: "http://www.wikidata.org/entity/Q213154", purpose: "identifying" },
      target: { type: "Canvas" },
    });
  });

  test("offers the smart tools", async ({ page }) => {
    await page.getByRole("button", { name: "Smart tools" }).click();
    await expect(page.locator(".a9s-osd-drawinglayer")).toHaveClass(/intelligent-scissors/);
    await page.getByRole("button", { name: "Edge Snap" }).click();
    await expect(page.locator(".a9s-osd-drawinglayer")).toHaveClass(/magnetic-cursor/);
  });

  test("turns pages from the gallery strip, which can be hidden", async ({ page }) => {
    const strip = page.getByRole("navigation", { name: "Pages" });
    await expect(strip.getByRole("button").first()).toBeVisible();
    await strip.getByRole("button").nth(2).click();
    await expect(strip.getByRole("button").nth(2)).toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(() =>
        (document.querySelector("mango-annotation-editor") as HTMLElement & { getCanvasIndex(): number }).getCanvasIndex(),
      ),
    ).toBe(2);
    await page.getByRole("button", { name: "Hide pages" }).click();
    await expect(strip).toHaveCount(0);
  });

  test("changes the viewer colour from settings, and remembers it", async ({ page }) => {
    const themes = () =>
      page.evaluate(() =>
        [...document.querySelector("mango-annotation-editor")!.shadowRoot!.querySelectorAll<HTMLElement>(".viewer")].map(
          (viewer) => viewer.dataset.theme,
        ),
      );
    expect(await themes()).toEqual(["light", "light"]);
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("radio", { name: "Sepia" }).click();
    // Both the editor chrome and Mango's stage take it.
    expect(await themes()).toEqual(["sepia", "sepia"]);
    await page.reload();
    await expect.poll(themes).toEqual(["sepia", "sepia"]);
  });

  test("downloads an AnnotationPage and tells the host", async ({ page }) => {
    await page.getByRole("button", { name: "This image" }).click();
    await page.getByRole("button", { name: "Highlight" }).click();
    await page.getByRole("button", { name: "Save annotation" }).click();

    const exported = page.evaluate(
      () =>
        new Promise((resolve) =>
          document
            .querySelector("mango-annotation-editor")!
            .addEventListener("exportAnnotationPage", (event) => resolve((event as CustomEvent).detail), { once: true }),
        ),
    );
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download annotations (1)" }).click();
    expect((await download).suggestedFilename()).toBe("annotations-draft.json");
    expect(await exported).toMatchObject({
      page: { type: "AnnotationPage", items: [{ motivation: "highlighting" }] },
      publicationValid: false,
    });
  });
});

test.describe("audio", () => {
  test.beforeEach(async ({ page }) => {
    const params = new URLSearchParams({ manifest: new URL(AUDIO, "http://127.0.0.1:4173/").href, type: "audio" });
    await page.goto(`/annotation-editor.html?${params}`);
    await expect(page.getByLabel("Start", { exact: true })).toBeVisible();
  });

  test("lists the recording's transcript, its annotations in the list, and chapters in Contents", async ({ page }) => {
    const firstLine = "Right, okay, can I have your name to start with?";
    await expect(page.getByRole("tabpanel", { name: "Transcript" }).getByRole("listitem").first()).toContainText(firstLine);

    // The editor's list has the annotations and Contents the chapters, so the player has neither tab.
    await expect(page.getByRole("tab", { name: "Annotations", exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Chapters" })).toHaveCount(0);

    // The item's annotations are in the sidebar, with no table under the player, and no transcript lines among them.
    await expect(page.locator(".annotation-table")).toHaveCount(0);
    const cards = page.locator(".annotation-list__card");

    // The demo signs in as Jane Jones, who made five of the item's annotations.
    await expect(page.getByRole("tab", { name: "Your annotations (5)" })).toHaveAttribute("aria-selected", "true");
    await expect(cards).toHaveCount(5);
    // They are hers but the item's, so they can be changed and not deleted.
    await expect(cards.first().getByRole("button", { name: "Delete" })).toHaveCount(0);

    // All annotations has everyone's, by name; other people's can be found but not changed.
    await page.getByRole("tab", { name: /^All annotations/ }).click();
    const others = cards.filter({ hasText: "Rhys Evans" });
    await expect(others.first()).toBeVisible();
    await expect(others.first().getByRole("button", { name: "Jump" })).toBeVisible();
    await expect(others.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(cards.filter({ hasText: "Yours" })).toHaveCount(5);
    await expect(cards.filter({ hasText: firstLine })).toHaveCount(0);

    // Editing one of hers from far down the list brings the form back into view, filled in.
    const pane = page.locator(".annotation-editor__annotate");
    const last = cards.filter({ hasText: "Yours" }).last();
    await last.scrollIntoViewIfNeeded();
    expect(await pane.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await last.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("button", { name: "Update annotation" })).toBeVisible();
    await expect.poll(() => pane.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(page.getByRole("group", { name: "What would you like to do?" })).toBeInViewport();

    await page.getByRole("tab", { name: "Contents" }).click();
    await expect(page.getByRole("navigation", { name: "Chapters" }).getByRole("button").first()).toContainText(
      "Suggested chapters (unreviewed)",
    );
  });

  test("annotates a time range and validates it", async ({ page }) => {
    await page.getByLabel("Start", { exact: true }).fill("30");
    await page.getByLabel("End (optional)").fill("10");
    await page.getByRole("button", { name: "Transcribe" }).click();
    await page.getByPlaceholder("Type it exactly as you hear or see it").fill("My father worked on the railway.");
    await page.getByRole("button", { name: "Save annotation" }).click();
    await expect(page.getByRole("alert")).toHaveText(/end time must be after the start/);

    await page.getByLabel("End (optional)").fill("45.5");
    await page.getByRole("button", { name: "Save annotation" }).click();
    const [saved] = await userAnnotations(page);
    expect(saved).toMatchObject({
      motivation: "supplementing",
      body: { value: "My father worked on the railway.", language: "en" },
      target: { selector: { type: "FragmentSelector", value: "t=30,45.5" } },
    });
    await expect(page.locator(".annotation-list__card").filter({ hasText: "My father worked" })).toContainText(
      "0:30 – 0:45",
    );
  });

  test("is one list when nobody is signed in", async ({ page }) => {
    const params = new URLSearchParams({ manifest: new URL(AUDIO, "http://127.0.0.1:4173/").href, type: "audio", user: "" });
    await page.goto(`/annotation-editor.html?${params}`);
    await expect(page.getByRole("heading", { name: /^Annotations \(\d+\)$/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Your annotations/ })).toHaveCount(0);
    await expect(page.locator(".annotation-list__card").filter({ hasText: "Jane Jones" }).first()).toBeVisible();
  });

  test("splits Your annotations from All annotations when the host names the user", async ({ page }) => {
    const user = "https://example.org/users/ann";
    const params = new URLSearchParams({
      manifest: new URL(AUDIO, "http://127.0.0.1:4173/").href,
      type: "audio",
      user,
    });
    await page.goto(`/annotation-editor.html?${params}`);
    await expect(page.getByLabel("Start", { exact: true })).toBeVisible();

    const mine = page.getByRole("tab", { name: /^Your annotations/ });
    const all = page.getByRole("tab", { name: /^All annotations/ });
    await expect(mine).toHaveText("Your annotations (0)");
    await expect(page.locator(".annotation-list__card")).toHaveCount(0);

    await page.getByLabel("Start", { exact: true }).fill("12");
    await page.getByRole("button", { name: "Transcribe" }).click();
    await page.getByPlaceholder("Type it exactly as you hear or see it").fill("The chapel was full.");
    await page.getByRole("button", { name: "Save annotation" }).click();

    // What the user writes is theirs, and says so.
    const [saved] = await userAnnotations(page);
    expect(saved).toMatchObject({ creator: { id: user, type: "Person" } });
    await expect(mine).toHaveText("Your annotations (1)");
    await expect(page.locator(".annotation-list__card")).toHaveCount(1);

    // All annotations has the item's too, with the user's marked.
    await all.click();
    await expect(all).toHaveAttribute("aria-selected", "true");
    const cards = page.locator(".annotation-list__card");
    expect(await cards.count()).toBeGreaterThan(1);
    await expect(cards.filter({ hasText: "The chapel was full." })).toContainText("Yours");
  });
});
