// Contact links as the editor shows them: a LinkedIn field, a Portfolio field and extra links. The
// stored draft keeps one flat `links` list, so these helpers translate in both directions without
// losing anything.

export const MAX_LINKS = 5;

export interface LinkSlots {
  linkedin: string | null;
  portfolio: string | null;
  extra: string[];
}

function hostOf(link: string): string {
  const withoutScheme = link.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const authority = withoutScheme.split(/[/?#]/, 1)[0] ?? "";
  return authority.split("@").pop()?.split(":", 1)[0]?.toLowerCase() ?? "";
}

export function isLinkedInLink(link: string): boolean {
  const host = hostOf(link.trim());
  return host === "linkedin.com" || host.endsWith(".linkedin.com");
}

/** The first LinkedIn link is LinkedIn, the first other link is Portfolio, the rest are extras. */
export function splitLinks(links: readonly string[]): LinkSlots {
  const slots: LinkSlots = { linkedin: null, portfolio: null, extra: [] };
  for (const raw of links) {
    const link = raw.trim();
    if (link === "") {
      continue;
    }
    if (slots.linkedin === null && isLinkedInLink(link)) {
      slots.linkedin = link;
    } else if (slots.portfolio === null && !isLinkedInLink(link)) {
      slots.portfolio = link;
    } else {
      slots.extra.push(link);
    }
  }
  return slots;
}

/** LinkedIn, Portfolio, then the extras: blanks dropped, at most `MAX_LINKS`. */
export function mergeLinks(slots: LinkSlots): string[] {
  return [slots.linkedin ?? "", slots.portfolio ?? "", ...slots.extra]
    .map((link) => link.trim())
    .filter((link) => link !== "")
    .slice(0, MAX_LINKS);
}

export type LinkKind = "linkedin" | "portfolio" | "link";

/** A web address, with or without `https://`; anything else (spaces, other schemes) is not one. */
function isWebAddress(value: string): boolean {
  const text = value.trim();
  if (text === "" || /\s/.test(text)) {
    return false;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** The message for a link field, or null when it is empty (links are optional) or valid. */
export function linkError(kind: LinkKind, value: string): string | null {
  if (value.trim() === "") {
    return null;
  }
  if (kind === "linkedin") {
    return isWebAddress(value) && isLinkedInLink(value) ? null : "Enter a valid LinkedIn URL.";
  }
  if (isWebAddress(value)) {
    return null;
  }
  return kind === "portfolio" ? "Enter a valid Portfolio URL." : "Enter a valid URL.";
}
