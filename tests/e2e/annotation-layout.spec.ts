import { expect, test, type Locator, type Page } from "@playwright/test";

const viewports = [
  { name: "phone portrait", width: 390, height: 664 },
  { name: "phone landscape", width: 844, height: 390 },
  { name: "iPad portrait", width: 820, height: 1180 },
  { name: "iPad landscape", width: 1180, height: 820 },
  { name: "desktop", width: 1440, height: 900 },
];

const box = async (locator: Locator) => {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
};

const expectContained = async (
  child: Locator,
  parent: Locator,
  tolerance = 1,
) => {
  const [childBox, parentBox] = await Promise.all([box(child), box(parent)]);
  expect(childBox.x).toBeGreaterThanOrEqual(parentBox.x - tolerance);
  expect(childBox.y).toBeGreaterThanOrEqual(parentBox.y - tolerance);
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(
    parentBox.x + parentBox.width + tolerance,
  );
  expect(childBox.y + childBox.height).toBeLessThanOrEqual(
    parentBox.y + parentBox.height + tolerance,
  );
};

const openAt = async (
  page: Page,
  path: string,
  viewport: { width: number; height: number },
) => {
  await page.setViewportSize(viewport);
  await page.goto(path);
  await expect(page.locator("mango-annotation-editor")).toBeVisible();
};

test.describe("annotation editor layout", () => {
  for (const viewport of viewports) {
    test(`is contained on ${viewport.name}`, async ({ page }) => {
      await openAt(page, "/annotation-editor.html", viewport);

      const host = page.locator("mango-annotation-editor");
      const viewer = host.locator(".viewer--annotation-editor");
      const editor = host.locator(".annotation-editor");
      await expect(editor).toBeVisible();

      const [hostBox, viewerBox, editorBox] = await Promise.all([
        box(host),
        box(viewer),
        box(editor),
      ]);
      expect(viewerBox.height).toBe(hostBox.height);
      expect(viewerBox.x + viewerBox.width).toBeLessThanOrEqual(
        hostBox.x + hostBox.width + 1,
      );
      expect(viewerBox.y + viewerBox.height).toBeLessThanOrEqual(
        hostBox.y + hostBox.height + 1,
      );
      expect(editorBox.width).toBeGreaterThan(100);
      expect(editorBox.height).toBeGreaterThan(100);
      expect(
        await page.evaluate(() => document.body.scrollWidth),
      ).toBeLessThanOrEqual(viewport.width);

      const fullscreen = host.getByRole("button", {
        name: /Enter fullscreen|Fullscreen/,
      });
      await expect(fullscreen).toBeVisible();
      await expectContained(fullscreen, viewer);
    });
  }

  /*
   * The check above asks whether the editor fits its host. It cannot see the
   * failure where the *host* is what overflows: an element taller than the room
   * left under the page header loses its bottom with no scrollbar to reach it.
   */
  for (const viewport of [
    { name: "short desktop", width: 1440, height: 700 },
    { name: "laptop", width: 1440, height: 800 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    test(`stays reachable on ${viewport.name}`, async ({ page }) => {
      await openAt(page, "/annotation-editor.html", viewport);
      await expect(page.locator("mango-annotation-editor .annotation-editor")).toBeVisible();

      const overhang = await page.evaluate(() => {
        const host = document.querySelector("mango-annotation-editor");
        if (!host) return Number.NaN;
        const doc = document.documentElement;
        // A page that scrolls can reach its whole document; one that clips
        // can only ever reach the viewport.
        const canScroll = doc.scrollHeight > doc.clientHeight + 1;
        const reachable = canScroll ? doc.scrollHeight : window.innerHeight;
        return host.getBoundingClientRect().bottom + window.scrollY - reachable;
      });

      expect(overhang).toBeLessThanOrEqual(1);
    });
  }

  test("puts the stage and the sidebar side by side on a laptop", async ({ page }) => {
    await openAt(page, "/annotation-editor.html", { width: 1280, height: 900 });
    const host = page.locator("mango-annotation-editor");
    const [stage, sidebar] = await Promise.all([
      box(host.locator(".annotation-editor__stage")),
      box(host.locator(".anno-sidebar")),
    ]);
    expect(stage.width).toBeGreaterThan(500);
    expect(sidebar.x).toBeGreaterThanOrEqual(stage.x + stage.width - 1);
    expect(sidebar.width).toBeGreaterThanOrEqual(320);
  });

  test("stacks stage, form and list on a phone, all reachable", async ({ page }) => {
    await openAt(page, "/annotation-editor.html", { width: 390, height: 664 });
    const host = page.locator("mango-annotation-editor");
    const editor = host.locator(".annotation-editor");

    for (const selector of [
      ".annotation-editor__stage",
      ".anno-sidebar",
      ".annotation-list",
    ]) {
      const region = host.locator(selector);
      await region.scrollIntoViewIfNeeded();
      await expect(region).toBeVisible();
      const [regionBox, editorBox] = await Promise.all([box(region), box(editor)]);
      expect(regionBox.width).toBeLessThanOrEqual(editorBox.width + 2);
    }
    const sizes = await editor.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(sizes.scrollHeight).toBeGreaterThan(sizes.clientHeight);
  });
});

test.describe("audio and video layout", () => {
  for (const [kind, manifest] of [
    ["video", "manifests/iiif-pcw-574604/manifest.json"],
    ["audio", "manifests/iiif-pcw-550555/manifest.json"],
  ] as const) {
    for (const viewport of [
      { name: "phone", width: 390, height: 700 },
      { name: "iPad portrait", width: 820, height: 1180 },
      { name: "desktop", width: 1440, height: 900 },
    ]) {
      test(`keeps the ${kind} controls inside the player on ${viewport.name}`, async ({ page }) => {
        const params = new URLSearchParams({ manifest: new URL(manifest, "http://127.0.0.1:4173/").href, type: kind });
        await openAt(page, `/annotation-editor.html?${params}`, viewport);
        const host = page.locator("mango-annotation-editor");
        const bar = host.locator(".vjs-control-bar");
        await expect(bar).toBeVisible();
        const player = host.locator(".av-stage .player");
        // The player re-skins RAMP's controls once it is ready, so measure after that settles.
        await expect(async () => {
          await expectContained(bar, player);
          await expectContained(player, host.locator(".annotation-editor__stage"));
        }).toPass();
        if (kind === "video") {
          const { width, height } = await box(host.locator(".video-js"));
          expect(width / height).toBeCloseTo(16 / 9, 1);
        }
      });
    }
  }
});
