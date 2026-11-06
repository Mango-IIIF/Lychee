import { describe, expect, it } from "vitest";
import { translate } from "./i18n";

describe("translate", () => {
  it("selects locale-aware plural messages", () => {
    expect(translate("annotate.loadNotes.bodies", { count: 1 }, "en")).toBe(
      "1 part the form cannot edit will be removed.",
    );
    expect(translate("annotate.loadNotes.bodies", { count: 2 }, "en")).toBe(
      "2 parts the form cannot edit will be removed.",
    );
    expect(translate("annotate.loadNotes.bodies", { count: 1 }, "es")).toBe(
      "se quitará 1 parte que el formulario no puede editar.",
    );
    expect(translate("annotate.loadNotes.bodies", { count: 2 }, "es")).toBe(
      "se quitarán 2 partes que el formulario no puede editar.",
    );
    expect(translate("annotate.loadNotes.bodies", { count: 2 }, "cy")).toBe(
      "bydd 2 o rannau na all y ffurflen eu golygu yn cael eu tynnu.",
    );
  });
});
