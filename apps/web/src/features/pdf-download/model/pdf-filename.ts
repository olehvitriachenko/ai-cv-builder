// The name the exported PDF will get, shown while it is being prepared. It follows the same rule as
// the API (`pdf-filename.ts`: `<Candidate name>-<Target role>.pdf`, letters, digits and single
// dashes); the file itself is named by the server's header once it arrives.

const MAX_BASE_LENGTH = 80;
const DEFAULT_BASE = "CV";

function sanitize(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\s+/gu, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export function expectedPdfFilename(name: string | null, role: string): string {
  const joined = [name ?? "", role]
    .map(sanitize)
    .filter((part) => part.length > 0)
    .join("-");
  const base = Array.from(joined).slice(0, MAX_BASE_LENGTH).join("").replace(/-+$/g, "") || DEFAULT_BASE;
  return `${base}.pdf`;
}
