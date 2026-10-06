import { describe, expect, it } from "vitest";
import { MARKER, bulletsToText, insertBulletBreak, removeEmptyBullet, textToBullets } from "./highlights-text";

describe("bulletsToText", () => {
  it("shows each highlight on its own line with a bullet", () => {
    expect(bulletsToText(["Built an assistant", "Improved performance"])).toBe(
      "• Built an assistant\n• Improved performance",
    );
  });

  it("is empty for no highlights", () => {
    expect(bulletsToText([])).toBe("");
  });
});

describe("textToBullets", () => {
  it("reads one highlight per line, without the bullet and surrounding spaces", () => {
    expect(textToBullets("• Built an assistant\n•   Improved performance  ")).toEqual([
      "Built an assistant",
      "Improved performance",
    ]);
  });

  it("drops blank lines and lines holding only a bullet", () => {
    expect(textToBullets("• One\n• \n\n•\n• Two")).toEqual(["One", "Two"]);
  });

  it("accepts lines typed or pasted without a bullet, and other bullet marks", () => {
    expect(textToBullets("One\n- Two\n* Three\n– Four")).toEqual(["One", "Two", "Three", "Four"]);
  });

  it("keeps a bullet sign inside the text", () => {
    expect(textToBullets("• Cut costs by 5 • 10%")).toEqual(["Cut costs by 5 • 10%"]);
  });

  it("round-trips what it shows", () => {
    const bullets = ["A", "B", "C"];
    expect(textToBullets(bulletsToText(bullets))).toEqual(bullets);
  });
});

describe("insertBulletBreak (Enter)", () => {
  it("starts a new bullet after the current line", () => {
    expect(insertBulletBreak("• One", 5, 5)).toEqual({ text: "• One\n• ", caret: 8 });
  });

  it("splits a line at the caret and carries the rest into the new bullet", () => {
    expect(insertBulletBreak("• OneTwo", 5, 5)).toEqual({ text: "• One\n• Two", caret: 8 });
  });

  it("replaces a selection", () => {
    expect(insertBulletBreak("• One and Two", 5, 10)).toEqual({ text: "• One\n• Two", caret: 8 });
  });

  it("starts the first bullet in an empty field", () => {
    expect(insertBulletBreak("", 0, 0)).toEqual({ text: `${MARKER}\n${MARKER}`, caret: 5 });
  });
});

describe("removeEmptyBullet (Backspace)", () => {
  it("removes an empty bullet line and puts the caret at the end of the line before", () => {
    expect(removeEmptyBullet("• One\n• ", 8)).toEqual({ text: "• One", caret: 5 });
  });

  it("does nothing when the line has text or the caret is elsewhere", () => {
    expect(removeEmptyBullet("• One\n• Two", 11)).toBeNull();
    expect(removeEmptyBullet("• One\n• ", 5)).toBeNull();
  });

  it("clears a lone empty bullet", () => {
    expect(removeEmptyBullet("• ", 2)).toEqual({ text: "", caret: 0 });
  });
});
