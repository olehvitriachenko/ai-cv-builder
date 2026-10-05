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
