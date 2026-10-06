import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Font } from '@react-pdf/renderer';

/**
 * Embedded fonts: the built-in PDF fonts have no Cyrillic, and the CV may be written in Ukrainian.
 * Inter (headings, meta) and Lora (body) match the on-screen A4 preview. See assets/fonts/README.md.
 */
export const SANS = 'Inter';
export const SERIF = 'Lora';

/**
 * The fonts live in `apps/api/assets/fonts`. `nest build` copies them to `dist/assets/fonts`
 * (compiled code is at `dist/modules/pdf/export`), so a built app is self-contained; when running
 * from source (`src/modules/pdf/export`) the same folder is two levels higher.
 */
function fontDirectory(): URL {
  const candidates = [
    new URL('../../../assets/fonts/', import.meta.url),
    new URL('../../../../assets/fonts/', import.meta.url),
  ];
  const found = candidates.find((candidate) => existsSync(fileURLToPath(candidate)));
  if (!found) {
    throw new Error('PDF fonts not found: expected assets/fonts next to the application');
  }
  return found;
}

/**
 * Prepares the fonts for the next document. Call it before **every** render, and never render two
 * documents at once (the renderer service serializes them).
 *
 * The renderer's loaded font objects keep per-document state. Reusing them left the next document
 * with a corrupted text layer ("Ada" extracted as "Ad\u0003") after a document that used Cyrillic,
 * so selection and search silently broke. The library's own `Font.reset()` does not help (it drops
 * the loaded data but keeps the cached load promise, so the fonts are never loaded again) and
 * `Font.clear()` also removes the built-in fonts. So the two families are removed and registered
 * again, which gives each document brand-new font objects.
 */
export function registerPdfFonts(): void {
  const registered = Font.getRegisteredFonts();
  Reflect.deleteProperty(registered, SANS);
  Reflect.deleteProperty(registered, SERIF);

  const directory = fontDirectory();
  const file = (name: string): string => fileURLToPath(new URL(name, directory));

  Font.register({
    family: SANS,
    fonts: [
      { src: file('Inter-Regular.ttf'), fontWeight: 400 },
      { src: file('Inter-Medium.ttf'), fontWeight: 500 },
      { src: file('Inter-SemiBold.ttf'), fontWeight: 600 },
    ],
  });
  Font.register({
    family: SERIF,
    fonts: [
      { src: file('Lora-Regular.ttf'), fontWeight: 400 },
      { src: file('Lora-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
    ],
  });
  // The default hyphenation rewrites words ("exam-ple" inside a URL). The PDF must hold exactly the
  // draft's text, so words are never split by the renderer; very long tokens are handled by the template.
  Font.registerHyphenationCallback((word) => [word]);
}
