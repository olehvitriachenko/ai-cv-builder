/** The file name of an exported CV: the full Unicode name, and a plain-ASCII fallback. Both end in `.pdf`. */
export interface PdfFilename {
  ascii: string;
  utf8: string;
}

const MAX_BASE_LENGTH = 80;
const DEFAULT_BASE = 'CV';

/**
 * Keeps letters, digits and single dashes; everything else (path separators, quotes, control
 * characters, dots, emoji, symbols) is dropped. Whitespace becomes a dash.
 */
function sanitize(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\s+/gu, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function bound(base: string): string {
  // Count code points, not UTF-16 units, so a character is never cut in half.
  const chars = Array.from(base).slice(0, MAX_BASE_LENGTH).join('');
  return chars.replace(/-+$/g, '');
}

/** Latin letters lose their diacritics; anything else outside ASCII is dropped. */
function toAscii(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/g, '');
}

/**
 * `<Candidate name>-<Target role>.pdf`, safe to use as a download name. Pure: no I/O, no logging of
 * the inputs (a name is personal data).
 */
export function pdfFilename(name: string | null, role: string): PdfFilename {
  const joined = [name ?? '', role]
    .map(sanitize)
    .filter((part) => part.length > 0)
    .join('-');
  const utf8Base = bound(joined) || DEFAULT_BASE;
  const asciiBase = bound(sanitize(toAscii(joined))) || DEFAULT_BASE;
  return { utf8: `${utf8Base}.pdf`, ascii: `${asciiBase}.pdf` };
}

/**
 * A `Content-Disposition` value that downloads the file under the given name. `filename` is the
 * ASCII fallback; `filename*` (RFC 5987) carries the real name. Every value is already restricted
 * to letters, digits and dashes by `pdfFilename`, so nothing needs escaping inside the quotes.
 */
export function contentDisposition(file: PdfFilename): string {
  return `attachment; filename="${file.ascii}"; filename*=UTF-8''${encodeURIComponent(file.utf8)}`;
}
