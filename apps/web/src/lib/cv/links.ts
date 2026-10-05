// The draft stores a person's links as one ordered list of strings. The editor shows them as
// LinkedIn, Portfolio and further links; these helpers translate between the two without ever
// losing a link (text that is not a URL is kept too).

export interface LinkFields {
  linkedin: string;
  portfolio: string;
  extra: string[];
}

export type LinkKind = "linkedin" | "portfolio" | "link";

/** The most links a CV can hold (the server's cap). */
export const MAX_LINKS = 5;

/** A web address, with or without `https://`; anything else (spaces, other schemes) is not one. */
function parseUrl(value: string): URL | null {
  const text = value.trim();
  if (text === "" || /\s/.test(text)) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".") ? url : null;
  } catch {
    return null;
  }
}

function isLinkedIn(value: string): boolean {
  const host = parseUrl(value)?.hostname.toLowerCase();
  return host !== undefined && (host === "linkedin.com" || host.endsWith(".linkedin.com"));
}

/**
 * The first LinkedIn address is the LinkedIn link, the first of the others the portfolio, the rest
 * are further links. Nothing is dropped: an unknown host or plain text lands in portfolio or extra.
 */
export function splitLinks(links: string[]): LinkFields {
  const trimmed = links.map((link) => link.trim()).filter((link) => link !== "");
  const linkedinIndex = trimmed.findIndex(isLinkedIn);
  const linkedin = linkedinIndex === -1 ? "" : (trimmed[linkedinIndex] ?? "");
  const rest = trimmed.filter((_, index) => index !== linkedinIndex);
  return { linkedin, portfolio: rest[0] ?? "", extra: rest.slice(1) };
}

/** LinkedIn, Portfolio, then the further links; blanks dropped, at most `MAX_LINKS`. */
export function mergeLinks({ linkedin, portfolio, extra }: LinkFields): string[] {
  return [linkedin, portfolio, ...extra]
    .map((link) => link.trim())
    .filter((link) => link !== "")
    .slice(0, MAX_LINKS);
}

/** The message for a link field, or null when it is empty (links are optional) or valid. */
export function linkError(kind: LinkKind, value: string): string | null {
  if (value.trim() === "") {
    return null;
  }
  if (kind === "linkedin") {
    return isLinkedIn(value) ? null : "Enter a valid LinkedIn URL.";
  }
  if (parseUrl(value) !== null) {
    return null;
  }
  return kind === "portfolio" ? "Enter a valid Portfolio URL." : "Enter a valid URL.";
}
