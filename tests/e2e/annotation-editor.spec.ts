import { expect, test } from "@playwright/test";

test("creates and saves an annotation with the package editor", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("ERR_BLOCKED_BY_RESPONSE") &&
      // WebKit reports remote image-service HTTP failures as an anonymous
      // console resource error. Page exceptions are tracked separately above;
      // a third-party tile returning 403 is not an application runtime error.
      !message.text().startsWith("Failed to load resource:")
    ) {
      runtimeErrors.push(message.text());
    }
  });

  await page.goto("/annotation-editor-wellcome.html");

  await expect(page.locator(".annotation-workspace")).toBeVisible();
  const editor = page.locator(".mango-annotation-editor");
  await expect(editor).toBeAttached();

  // Let the OpenSeadragon canvas dimensions settle before starting an interaction.
  await page.waitForTimeout(1_500);

  // Selecting a tool also verifies that toolbar state reaches the package editor.
  await page.getByRole("button", { name: "Point" }).click();
  await expect(page.locator(".left-sidebar__tool--active")).toHaveText("Point");
  await page.waitForTimeout(200);

  const drawingSurface = page.locator(".mango-annotation-editor__svg");
  const bounds = await drawingSurface.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  const savedRows = page.locator(".annotation-table tbody tr");
  const rowsBefore = await savedRows.count();
  const pointsBefore = await drawingSurface.locator("circle").count();

  await drawingSurface.click({
    position: { x: bounds.width * 0.5, y: bounds.height * 0.5 },
  });

  await expect
    .poll(() => drawingSurface.locator("circle").count())
    .toBeGreaterThan(pointsBefore);
  await expect(drawingSurface.locator("circle").first()).toHaveAttribute(
    "fill",
    "rgba(167, 139, 250, 0.18)",
  );

  await page.getByRole("button", { name: "Save Annotation" }).click();

  await expect(savedRows).toHaveCount(rowsBefore + 1);
  await expect
    .poll(() => drawingSurface.locator("circle").count())
    .toBeGreaterThan(pointsBefore);
  expect(runtimeErrors).toEqual([]);
});

test("downloads the same draft payload it reports to the host", async ({ page }) => {
  await page.goto("/annotation-editor.html");
  const host = page.locator("mango-annotation-editor");
  await host.evaluate((element: HTMLElement) => {
    element.addEventListener("exportAnnotationPage", ((event: CustomEvent) => {
      (window as typeof window & { annotationExport?: unknown }).annotationExport =
        event.detail;
    }) as EventListener);
  });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    host.getByRole("button", { name: "Download annotation draft" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("mango-annotations-draft.json");
  const detail = await page.evaluate(
    () => (window as typeof window & { annotationExport?: any }).annotationExport,
  );
  expect(detail.page.type).toBe("AnnotationPage");
  expect(detail.draftValid).toBe(true);
  expect(detail.publicationValid).toBe(false);
  await expect(host.getByRole("status")).toContainText(
    "Assign HTTP(S) page and annotation IDs",
  );
});

test("uses setup languages and preserves text while switching", async ({ page }) => {
  await page.goto("/annotation-editor.html");
  const host = page.locator("mango-annotation-editor");
  await expect(host.locator(".annotation-workspace")).toBeVisible();
  await expect
    .poll(() => host.evaluate((element: any) => element.getCanvasId()))
    .not.toBeNull();

  await host.getByRole("button", { name: "Rectangle", exact: true }).click();
  await host
    .getByRole("button", {
      name: /Create Rectangle at the current view centre/,
    })
    .click();

  const english = host.locator('[data-testid="annotation-language-en"]');
  const welsh = host.locator('[data-testid="annotation-language-cy"]');
  await expect(english).toHaveAttribute("aria-selected", "true");
  await expect(welsh).toBeVisible();

  await welsh.click();
  const text = host.locator("#anno-text");
  await text.fill("Testun Cymraeg");
  await text.press("Backspace");
  await expect(text).toHaveValue("Testun Cymrae");
  await expect(host.getByText("New annotation", { exact: true })).toBeVisible();
  await english.click();
  await expect(text).toHaveValue("");
  await welsh.click();
  await expect(text).toHaveValue("Testun Cymrae");

  await host.getByRole("button", { name: "Save Annotation" }).click();
});

test("creates rectangles and points without pointer geometry gestures", async ({ page }) => {
  await page.goto("/annotation-editor.html");
  const host = page.locator("mango-annotation-editor");
  await expect(host.locator(".annotation-workspace")).toBeVisible();
  await expect
    .poll(() => host.evaluate((element: any) => element.getCanvasId()))
    .not.toBeNull();

  await host.getByRole("button", { name: "Rectangle", exact: true }).click();
  await host
    .getByRole("button", {
      name: /Create Rectangle at the current view centre/,
    })
    .click();
  await expect(host.getByText("New annotation", { exact: true })).toBeVisible();
  await host.getByText("Position", { exact: true }).click();
  const rectangleCoordinates = host.locator(
    '[data-testid="annotation-geometry"] input',
  );
  await expect(rectangleCoordinates).toHaveCount(4);
  await rectangleCoordinates.first().fill("100");
  await rectangleCoordinates.first().blur();
  await host.getByRole("button", { name: "Cancel" }).click();

  await host.getByRole("button", { name: "Point", exact: true }).click();
  await host
    .getByRole("button", { name: /Create Point at the current view centre/ })
    .click();
  await host.getByText("Position", { exact: true }).click();
  await expect(
    host.locator('[data-testid="annotation-geometry"] input'),
  ).toHaveCount(2);
  await host.getByRole("button", { name: "Save Annotation" }).click();
});
