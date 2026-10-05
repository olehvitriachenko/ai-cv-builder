/**
 * Deterministic, pure checks that a fact in a generated draft is supported by the source text.
 * No AI and no fuzzy matching.
 *
 * Normalisation is Unicode-aware (NFKC, then lower-casing) and tokenisation keeps letters, digits
 * and combining marks of any script. Diacritics are NOT stripped and abbreviations or acronyms
 * are NOT expanded: the prompt requires proper names to be copied exactly, so a changed spelling
 * is treated as unsupported rather than guessed at.
 *
 * Limits (accepted): these checks catch invented contact details and organisations. They cannot
 * prove that a bullet, date, title or skill is faithful; that is left to the prompt contract and
 * to clarification questions.
 */

/** How many extra source tokens may sit between the tokens of a name (see `tokensWithinWindow`). */
const NAME_WINDOW_SLACK = 2;

/** A phone number needs at least this many digits to be checked at all. */
const MIN_PHONE_DIGITS = 5;

/** Legal-form words: "Acme Inc." and "Acme" are the same organisation for our purposes. */
const LEGAL_SUFFIXES = new Set([
  'inc',
  'llc',
  'ltd',
  'gmbh',
  'corp',
  'corporation',
  'co',
  'plc',
  'sa',
  'ag',
  'bv',
  'limited',
  'company',
]);

const ARTICLES = new Set(['the', 'a', 'an', 'of', 'and', 'for']);

function foldCase(input: string): string {
  return input.normalize('NFKC').toLowerCase();
}

/** Lower-cased NFKC tokens made of letters, digits and marks; `&` counts as "and". */
export function tokenize(input: string): string[] {
  return foldCase(input)
    .replaceAll('&', ' and ')
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter((token) => token.length > 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `needle` occurs in `haystack` as a whole contact token: not glued to more of an
 * address or domain on either side (`nada@x.com` does not contain `ada@x.com`, `x.com.au` does not
 * contain `x.com`), while a trailing sentence period is fine.
 */
function occursAsToken(needle: string, haystack: string): boolean {
  if (needle.length === 0) {
    return false;
  }
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}@._-])${escapeRegExp(needle)}(?!\\/?[\\p{L}\\p{N}_-])(?!\\.[\\p{L}\\p{N}])`,
    'u',
  );
  return pattern.test(haystack);
}

function stripLinkNoise(value: string): string {
  return foldCase(value)
    .replace(/\bhttps?:\/\//g, '')
    .replace(/\bwww\./g, '');
}

/** Digit-only forms of the number-like runs in one source line (separators stay inside a run). */
function digitRuns(source: string): string[] {
  const runs: string[] = [];
  for (const line of source.normalize('NFKC').split(/\r?\n/)) {
    for (const match of line.matchAll(/\p{Nd}(?:[\p{Nd} \t ().\-/]*\p{Nd})?/gu)) {
      runs.push(match[0].replace(/\P{Nd}/gu, ''));
    }
  }
  return runs;
}

/**
 * True when every token of `needle` appears inside one local window of the source tokens, in any
 * order. The window is `needle.length + NAME_WINDOW_SLACK` tokens, so a name must be found close
 * together, not assembled from words scattered across the whole document.
 */
function tokensWithinWindow(needle: string[], sourceTokens: string[]): boolean {
  const wanted = [...new Set(needle)];
  if (wanted.length === 0) {
    return false;
  }
  const size = wanted.length + NAME_WINDOW_SLACK;

  for (let start = 0; start < sourceTokens.length; start += 1) {
    if (!wanted.includes(sourceTokens[start] ?? '')) {
      continue;
    }
    const window = new Set(sourceTokens.slice(start, start + size));
    if (wanted.every((token) => window.has(token))) {
      return true;
    }
  }
  return false;
}

/** Drops legal suffixes and articles; keeps all tokens if nothing else would be left. */
function significantTokens(tokens: string[]): string[] {
  const significant = tokens.filter((token) => !LEGAL_SUFFIXES.has(token) && !ARTICLES.has(token));
  return significant.length > 0 ? significant : tokens;
}

export interface SourceIndex {
  hasEmail(email: string): boolean;
  hasPhone(phone: string): boolean;
  hasLink(link: string): boolean;
  /** Every name token of two or more letters appears close together in the source. */
  hasPersonName(name: string): boolean;
  /** Employer or institution: tolerant of case, punctuation, word order and legal suffixes. */
  hasOrganisation(name: string): boolean;
}

/** Prepares the source once so every check in a validation run reuses the same normalisation. */
export function indexSource(sourceText: string): SourceIndex {
  const folded = foldCase(sourceText);
  const linkText = stripLinkNoise(sourceText);
  const runs = digitRuns(sourceText);
  const rawTokens = tokenize(sourceText);
  const sourceSignificant = significantTokens(rawTokens);

  return {
    hasEmail: (email) => occursAsToken(foldCase(email).trim(), folded),

    hasPhone: (phone) => {
      const digits = phone.normalize('NFKC').replace(/\P{Nd}/gu, '');
      return digits.length >= MIN_PHONE_DIGITS && runs.includes(digits);
    },

    hasLink: (link) => occursAsToken(stripLinkNoise(link).trim().replace(/\/+$/, ''), linkText),

    hasPersonName: (name) => {
      const tokens = tokenize(name);
      const long = tokens.filter((token) => Array.from(token).length >= 2);
      return tokensWithinWindow(long.length > 0 ? long : tokens, rawTokens);
    },

    hasOrganisation: (name) =>
      tokensWithinWindow(significantTokens(tokenize(name)), sourceSignificant),
  };
}
