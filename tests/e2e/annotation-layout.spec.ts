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
      const workspace = host.locator(".annotation-workspace");
      await expect(workspace).toBeVisible();

      const [hostBox, viewerBox, workspaceBox] = await Promise.all([
        box(host),
        box(viewer),
        box(workspace),
      ]);
      expect(viewerBox.height).toBe(hostBox.height);
      expect(viewerBox.x + viewerBox.width).toBeLessThanOrEqual(
        hostBox.x + hostBox.width + 1,
      );
      expect(viewerBox.y + viewerBox.height).toBeLessThanOrEqual(
        hostBox.y + hostBox.height + 1,
      );
      expect(workspaceBox.width).toBeGreaterThan(100);
      expect(workspaceBox.height).toBeGreaterThan(100);
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
   * left under the hero loses its bottom with no scrollbar to reach it. That
   * only bites below roughly 800px of viewport height, which is why these
   * heights are checked separately.
   */
  for (const viewport of [
    { name: "short desktop", width: 1440, height: 700 },
    { name: "laptop", width: 1440, height: 800 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    test(`stays reachable on ${viewport.name}`, async ({ page }) => {
      await openAt(page, "/annotation-editor.html", viewport);
      await expect(
        page.locator("mango-annotation-editor").locator(".viewer"),
      ).toHaveCount(2);

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

  test("keeps the editor multi-column on an ordinary laptop", async ({
    page,
  }) => {
    // The editor collapsed to a single stacked column below 1200px, so a 1280px
    // laptop lost the list/canvas/inspector layout entirely. Three columns need
    // roughly 1000px, so the collapse belongs at the 1024px breakpoint.
    await openAt(page, "/annotation-editor.html", { width: 1280, height: 900 });
    await page.locator("mango-annotation-editor .annotation-workspace").waitFor();

    const layout = await page.evaluate(() => {
      const workspace = document
        .querySelector("mango-annotation-editor")!
        .shadowRoot!.querySelector(".annotation-workspace")!;
      const columns = getComputedStyle(workspace).gridTemplateColumns.split(" ");
      const centre = workspace.querySelector(".annotation-workspace__center");
      return {
        columnCount: columns.length,
        canvasWidth: centre
          ? Math.round(centre.getBoundingClientRect().width)
          : 0,
      };
    });
    expect(layout.columnCount).toBe(3);
    expect(layout.canvasWidth).toBeGreaterThan(400);
  });

  test("keeps tools, canvas, table, and inspector reachable on a phone", async ({
    page,
  }) => {
    await openAt(page, "/annotation-editor.html", { width: 390, height: 664 });
    const host = page.locator("mango-annotation-editor");
    const workspace = host.locator(".annotation-workspace");

    for (const selector of [
      ".annotation-workspace__left",
      ".annotation-workspace__stage",
      ".annotation-workspace__bottom",
      ".annotation-workspace__right",
    ]) {
      const region = host.locator(selector);
      await region.scrollIntoViewIfNeeded();
      await expect(region).toBeVisible();
      await expectContained(region, workspace, 2);
    }
    const sizes = await workspace.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(sizes.scrollHeight).toBeGreaterThan(sizes.clientHeight);
  });
});
