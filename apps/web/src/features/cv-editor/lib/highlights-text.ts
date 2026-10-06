// The highlights of a role as the editor shows them (Figma "Field / Highlights / Bullet list"): one
// text field, one highlight per line, each line starting with a bullet, and Enter starting the next
// bullet. The stored draft keeps a list of strings; these pure helpers translate both ways.

export const MARKER = "• ";

/** Bullet marks accepted at the start of a line (typed, pasted from elsewhere). */
const LEADING_MARK = /^\s*(?:[•\-*–—]\s*)?/;

export function bulletsToText(bullets: readonly string[]): string {
  return bullets.map((bullet) => `${MARKER}${bullet}`).join("\n");
}

/** One highlight per line: the bullet and surrounding spaces are dropped, empty lines are ignored. */
export function textToBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(LEADING_MARK, "").trim())
    .filter((line) => line !== "");
}

export interface TextEdit {
  text: string;
  caret: number;
}

/** Enter: replaces the selection with a line break and a new bullet; the rest of the line moves down. */
export function insertBulletBreak(text: string, selectionStart: number, selectionEnd: number): TextEdit {
  if (text === "") {
    return { text: `${MARKER}\n${MARKER}`, caret: MARKER.length * 2 + 1 };
  }
  const insert = `\n${MARKER}`;
  return {
    text: text.slice(0, selectionStart) + insert + text.slice(selectionEnd),
    caret: selectionStart + insert.length,
  };
}

/**
 * Backspace right after the bullet of an empty line removes that line, so the caret returns to the
 * end of the line above (or the field becomes empty). Anywhere else it is an ordinary Backspace.
 */
export function removeEmptyBullet(text: string, caret: number): TextEdit | null {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const lineEnd = text.indexOf("\n", caret) === -1 ? text.length : text.indexOf("\n", caret);
  const line = text.slice(lineStart, lineEnd);
  if (line.trim() !== MARKER.trim() || caret !== lineStart + line.length) {
    return null;
  }
  if (lineStart === 0) {
    return { text: text.slice(lineEnd + 1), caret: 0 };
  }
  return { text: text.slice(0, lineStart - 1) + text.slice(lineEnd), caret: lineStart - 1 };
}
